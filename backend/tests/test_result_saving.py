import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Competition, CompetitionParticipant, Discipline, DisciplineResult, ParticipantDiscipline, User
from result_store import save_discipline_result


# Importing main runs legacy backfills; keep those off the configured database.
bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()


class ResultSavingTests(unittest.TestCase):
    def make_engine(self):
        return create_engine("sqlite://")

    def setUp(self):
        self.engine = self.make_engine()
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.sessions()
        self.db.add(Competition(
            id=1, name="Test", date="2099-01-01", location="Test",
            status="started", created_by="judge@example.test",
        ))
        self.db.flush()
        self.db.add_all([
            Discipline(id=1, competition_id=1, name="Pistolet", scoring_type="points", shots_count=10),
            CompetitionParticipant(
                id=1, competition_id=1, user_email="shooter@example.test",
                first_name="Jan", last_name="Testowy", entry_type="shooter", checked_in=1, paid=1,
            ),
        ])
        self.db.flush()
        self.db.add(ParticipantDiscipline(participant_id=1, discipline_id=1, ammo_type="own"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def save(self, **changes):
        values = dict(
            competition_id=1, discipline_id=1, participant_id=1,
            judge_email="judge@example.test", points="78",
        )
        values.update(changes)
        return save_discipline_result(self.db, **values)

    def test_repeated_save_keeps_one_result_and_one_score(self):
        result_id = self.save().id
        self.db.commit()
        for _ in range(5):
            self.assertEqual(self.save().id, result_id)
            self.db.commit()
        self.assertEqual(self.db.query(DisciplineResult).count(), 1)
        competition = self.db.get(Competition, 1)
        for category in ("discipline-1", "overall"):
            payload = main.result_category_payload(competition, category, self.db)
            self.assertEqual(payload["shooters"][0]["points"], "78")

    def test_edit_replaces_points_and_preserves_unspecified_details(self):
        original = self.save(result_data='{"shots": [10, 8]}')
        self.db.commit()
        edited = self.save(points="93", judge_email="other@example.test")
        self.db.commit()
        self.assertEqual(original.id, edited.id)
        self.assertEqual(edited.points, "93")
        self.assertEqual(edited.judge_email, "other@example.test")
        self.assertEqual(edited.result_data, '{"shots": [10, 8]}')
        self.assertEqual(self.save(points="0", result_data="").result_data, "")
        self.db.commit()
        self.assertEqual(self.db.query(DisciplineResult).count(), 1)

    def test_transaction_owner_can_roll_back_save(self):
        self.save()
        self.db.rollback()
        self.assertEqual(self.db.query(DisciplineResult).count(), 0)

    def test_database_rejects_duplicate_from_other_writers(self):
        self.save()
        self.db.commit()
        self.db.add(DisciplineResult(
            competition_id=1, discipline_id=1, participant_id=1,
            judge_email="judge@example.test", points="78",
        ))
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()

    def test_judge_endpoint_retries_and_edits_one_result(self):
        judge = User(email="judge@example.test", role="judge", roles="judge")
        with (
            patch("main.auto_complete_started_competitions"),
            patch("main.judge_can_access_discipline", return_value=True),
        ):
            for points in ("78", "78", "93"):
                response = main.save_judge_result(
                    1, 1, main.JudgeResultData(participant_id=1, points=points),
                    user=judge, db=self.db,
                )
                self.assertEqual(response["points"], points)
        self.assertEqual(self.db.query(DisciplineResult).count(), 1)
        self.assertEqual(self.db.query(DisciplineResult).one().points, "93")

    def test_dynamic_recalculation_updates_the_existing_result(self):
        row = dict(competitor_id=1, stage_points="100", percent="100", place=1, stage_wins=1)
        with patch("main.dynamic_final_classification", return_value=[row]):
            main.update_dynamic_discipline_results(1, 1, "judge@example.test", self.db)
            self.db.commit()
            original_id = self.db.query(DisciplineResult).one().id
            row["stage_points"] = "80"
            main.update_dynamic_discipline_results(1, 1, "judge@example.test", self.db)
            self.db.commit()
        result = self.db.query(DisciplineResult).one()
        self.assertEqual(result.id, original_id)
        self.assertEqual(result.points, "80")
        self.assertIn('"discipline": "dynamic-stage"', result.result_data)


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "TEST_POSTGRES_URL is not configured")
class PostgresResultSavingTests(ResultSavingTests):
    def make_engine(self):
        self.schema = "result_test_" + uuid4().hex
        self.admin_engine = create_engine(os.environ["TEST_POSTGRES_URL"])
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        return create_engine(
            os.environ["TEST_POSTGRES_URL"],
            connect_args={"options": f"-csearch_path={self.schema} -cstatement_timeout=10000"},
        )

    def tearDown(self):
        super().tearDown()
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.admin_engine.dispose()

    def test_concurrent_first_saves_all_succeed_without_doubling(self):
        barrier = Barrier(8)

        def save_once(_):
            with self.sessions() as db:
                barrier.wait(timeout=10)
                result = save_discipline_result(
                    db, competition_id=1, discipline_id=1, participant_id=1,
                    judge_email="judge@example.test", points="78",
                )
                result_id = result.id
                db.commit()
                return result_id

        with ThreadPoolExecutor(max_workers=8) as pool:
            ids = list(pool.map(save_once, range(8)))
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(self.db.query(DisciplineResult).count(), 1)
        payload = main.result_category_payload(self.db.get(Competition, 1), "discipline-1", self.db)
        self.assertEqual(payload["shooters"][0]["points"], "78")
