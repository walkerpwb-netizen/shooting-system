from datetime import datetime
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import (
    Achievement, AppSetting, Competition, CompetitionParticipant, Discipline,
    DisciplineResult, ParticipantDiscipline, RankingEntry, User,
)


bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()

path = Path(__file__).resolve().parents[1] / "migrations/versions/7d4a9b2c6e10_correct_autumn_competition_shotgun_types.py"
spec = importlib.util.spec_from_file_location("shotgun_type_correction", path)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class ShotgunTypeCorrectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.db = self.sessions()
        self.competition = Competition(
            id=143, name="III WYSOKOGÓRSKI WIELOBÓJ JESIENNY", date="2026-10-17",
            location="Test", status="completed", created_by="organizer@example.test",
            completed_at="2026-10-17T17:10:08+02:00",
        )
        self.db.add(self.competition)
        self.db.add(AppSetting(key="competition_derived_cache_version", value="old-cache"))
        self.db.flush()
        for discipline_id in range(309, 318):
            self.db.add(Discipline(
                id=discipline_id, competition_id=143,
                name={316: "STRZELBA STATYCZNA", 317: "STRZELBA DYNAMICZNA"}.get(discipline_id, "Test"),
                discipline_type=("pistol" if discipline_id < 313 else "rifle" if discipline_id < 316 else "moving-target"),
                scoring_type="points", shots_count=10,
            ))
        for participant_id in range(1, 11):
            email = f"shooter-{participant_id}@example.test"
            self.db.add(User(
                id=participant_id, email=email, first_name="Jan", last_name=str(participant_id),
                birth_date="1990-01-01", voivodeship="mazowieckie", no_club=1,
                license_number=f"TEST-{participant_id}", role="shooter",
            ))
            self.db.add(CompetitionParticipant(
                id=participant_id, competition_id=143, user_email=email, entry_type="shooter",
                checked_in=1, paid=1,
            ))
        self.db.flush()
        for participant_id in range(1, 11):
            for discipline_id in range(309, 318):
                self.db.add(ParticipantDiscipline(
                    participant_id=participant_id, discipline_id=discipline_id, ammo_type="own",
                ))
                self.db.add(DisciplineResult(
                    competition_id=143, discipline_id=discipline_id, participant_id=participant_id,
                    judge_email="judge@example.test", points=str(101 - participant_id),
                    result_data='{"base_points":"unchanged"}',
                ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def upgrade(self):
        with patch.object(migration, "op", Operations(MigrationContext.configure(self.db.connection()))):
            migration.upgrade()
        self.db.commit()
        self.db.expire_all()

    def cache(self):
        return self.db.query(AppSetting).filter_by(key="competition_derived_cache_version").first()

    def test_corrects_only_types_preserves_scores_and_invalidates_derived_cache(self):
        before = [(r.id, r.points, r.result_data) for r in self.db.query(DisciplineResult).order_by(DisciplineResult.id)]
        self.upgrade()
        self.assertEqual([self.db.get(Discipline, key).discipline_type for key in (316, 317)], ["shotgun", "shotgun"])
        self.assertEqual(self.db.get(Discipline, 315).discipline_type, "rifle")
        self.assertEqual([self.db.get(Discipline, key).scoring_type for key in (316, 317)], ["points", "points"])
        self.assertEqual(before, [(r.id, r.points, r.result_data) for r in self.db.query(DisciplineResult).order_by(DisciplineResult.id)])
        self.assertIsNone(self.cache())
        self.db.add(AppSetting(key="competition_derived_cache_version", value="rebuilt"))
        self.db.commit()
        self.upgrade()
        self.assertEqual(self.cache().value, "rebuilt")

    def test_requires_matching_event_identity(self):
        for field, value in (("name", "Another event"), ("date", "2026-10-18")):
            original = getattr(self.competition, field)
            setattr(self.competition, field, value)
            self.db.commit()
            self.upgrade()
            self.assertEqual(self.db.get(Discipline, 316).discipline_type, "moving-target")
            self.assertIsNotNone(self.cache())
            setattr(self.competition, field, original)
            self.db.commit()

    def test_preserves_other_names_and_already_corrected_types(self):
        self.db.get(Discipline, 316).name = "Real moving target"
        self.db.get(Discipline, 317).discipline_type = "trap"
        self.db.commit()
        self.upgrade()
        self.assertEqual(self.db.get(Discipline, 316).discipline_type, "moving-target")
        self.assertEqual(self.db.get(Discipline, 317).discipline_type, "trap")
        self.assertIsNotNone(self.cache())

    def test_corrects_aggregates_license_starts_rankings_and_trophies(self):
        main.refresh_ranking_and_achievement_entries(self.db)
        self.db.commit()
        self.assertEqual(main.result_category_payload(self.competition, "shotgun", self.db)["shooters"], [])
        self.upgrade()
        shotgun = main.result_category_payload(self.competition, "shotgun", self.db)
        self.assertEqual(shotgun["category"]["discipline_ids"], [316, 317])
        self.assertEqual(len(shotgun["shooters"]), 10)
        self.assertEqual(shotgun["shooters"][0]["points"], "200")
        self.assertEqual(main.result_category_payload(self.competition, "rifle", self.db)["category"]["disciplines_count"], 3)
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = datetime(2026, 10, 23, tzinfo=main.APP_TIMEZONE)
            status = main.user_license_starts(self.db.get(User, 1), self.db)
        self.assertTrue(status["complete"])
        self.assertEqual(status["categories"]["shotgun"]["completed"], 2)
        self.assertEqual(status["categories"]["rifle"]["completed"], 3)
        with patch("main.SessionLocal", self.sessions):
            main.backfill_competition_derived_cache()
        self.db.expire_all()
        self.assertIsNotNone(self.cache())
        for metric, points in (("shotgun", "200"), ("rifle", "300"), ("overall", "900")):
            ranking = self.db.query(RankingEntry).filter_by(user_id=1, scope="national", metric=metric).one()
            self.assertEqual(ranking.points, points)
        awards = self.db.query(Achievement).filter_by(competition_id=143, category_id="shotgun").all()
        self.assertEqual(len(awards), 3)
        self.assertTrue(all(award.badge_type == "shotgun" for award in awards))
