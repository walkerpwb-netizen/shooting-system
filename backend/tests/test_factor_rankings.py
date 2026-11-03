import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import (
    AppSetting, Competition, CompetitionParticipant, Discipline, DisciplineResult,
    ParticipantDiscipline, RankingEntry, User,
)


bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()

path = Path(__file__).resolve().parents[1] / "migrations/versions/6e3b8d2f9a41_mark_autumn_shotgun_factor_scoring.py"
spec = importlib.util.spec_from_file_location("factor_scoring_migration", path)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class FactorRankingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.sessions()
        self.competition = Competition(
            id=143, name="III WYSOKOGÓRSKI WIELOBÓJ JESIENNY", date="2026-10-17",
            location="Test", status="completed", created_by="organizer@example.test",
        )
        self.db.add(self.competition)
        self.db.flush()
        for discipline_id, name, discipline_type in (
            (316, "STRZELBA STATYCZNA", "shotgun"),
            (317, "STRZELBA DYNAMICZNA", "shotgun"),
            (318, "Zwykłe punkty", "shotgun"),
            (319, "Wiele torów", "practical-shotgun"),
        ):
            self.db.add(Discipline(
                id=discipline_id, competition_id=143, name=name,
                discipline_type=discipline_type, scoring_type="points", shots_count=7,
            ))
        for participant_id in range(1, 11):
            email = f"shooter-{participant_id}@example.test"
            # The best factor belongs to a competitor without a linked account.
            if participant_id != 2:
                self.db.add(User(
                    id=participant_id, email=email, first_name="Jan", last_name=str(participant_id),
                    birth_date="1990-01-01", voivodeship="mazowieckie", no_club=1, no_license=1,
                ))
            self.db.add(CompetitionParticipant(
                id=participant_id, competition_id=143, user_email=email,
                entry_type="shooter", checked_in=1, paid=1,
            ))
        self.db.flush()
        for participant_id in range(1, 11):
            for discipline_id in range(316, 320):
                points = {
                    316: {1: "1", 2: "2", 4: "0,5"},
                    317: {1: "2", 2: "4"},
                    318: {1: "70", 2: "60"},
                    319: {1: "137.25", 2: "200"},
                }[discipline_id].get(participant_id, "0")
                self.db.add(ParticipantDiscipline(
                    participant_id=participant_id, discipline_id=discipline_id, ammo_type="own",
                ))
                self.db.add(DisciplineResult(
                    competition_id=143, participant_id=participant_id, discipline_id=discipline_id,
                    points=points, judge_email="judge@example.test",
                    result_data=json.dumps({"discipline": "dynamic-stage", "stage_points": points})
                    if discipline_id == 319 else None,
                ))
        self.db.add(AppSetting(
            key="competition_derived_cache_version", value="2026-11-03-factor-ranking-points-v4",
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

    def recorded_results(self):
        return [
            (r.id, r.points, r.result_data)
            for r in self.db.query(DisciplineResult).order_by(DisciplineResult.id)
        ]

    def test_migration_preserves_competition_results_and_only_marks_target_disciplines(self):
        recorded = self.recorded_results()
        payloads = {
            category: main.result_category_payload(self.competition, category, self.db)["shooters"]
            for category in ("discipline-316", "discipline-317", "shotgun", "overall")
        }
        self.upgrade()
        self.assertEqual([self.db.get(Discipline, i).scoring_type for i in range(316, 320)],
                         ["factor", "factor", "points", "points"])
        self.assertEqual(recorded, self.recorded_results())
        for category, shooters in payloads.items():
            self.assertEqual(main.result_category_payload(self.competition, category, self.db)["shooters"], shooters)
        self.assertIsNone(self.db.query(AppSetting).filter_by(key="competition_derived_cache_version").first())
        self.db.add(AppSetting(key="competition_derived_cache_version", value="rebuilt"))
        self.db.commit()
        self.upgrade()
        self.assertEqual(self.db.query(AppSetting).one().value, "rebuilt")

    def test_migration_requires_matching_identity_and_preserves_other_scoring(self):
        for entity, field, value in (
            (self.competition, "name", "Other event"),
            (self.competition, "date", "2026-10-18"),
            (self.db.get(Discipline, 316), "name", "Other discipline"),
            (self.db.get(Discipline, 316), "discipline_type", "trap"),
            (self.db.get(Discipline, 316), "scoring_type", "custom"),
        ):
            with self.subTest(field=field, value=value):
                original = getattr(entity, field)
                setattr(entity, field, value)
                self.db.commit()
                self.upgrade()
                self.assertEqual(self.db.get(Discipline, 316).scoring_type,
                                 value if field == "scoring_type" else "points")
                setattr(entity, field, original)
                self.db.commit()

    def test_rankings_use_all_competitors_and_round_already_converted_stage_points(self):
        self.upgrade()
        main.rebuild_ranking_entries(self.db)
        self.db.commit()
        for scope in ("national", "regional"):
            for metric, expected in (("overall", "307"), ("shotgun", "307"), ("practical-shotgun", "137")):
                entry = self.db.query(RankingEntry).filter_by(scope=scope, metric=metric, user_id=1).one()
                self.assertEqual(entry.points, expected)
        # Decimal commas and zero results use the same conversion.
        self.assertEqual(self.db.query(RankingEntry).filter_by(scope="national", metric="overall", user_id=4).one().points, "25")
        self.assertEqual(self.db.query(RankingEntry).filter_by(user_id=3).count(), 0)
        user = self.db.get(User, 1)
        self.assertEqual(main.user_competition_statistics(user, self.db)["total_points_sum"], "307.25")
        self.assertEqual(main.user_start_history(user, self.db)["total_points"], "307.25")
        direct = main.ranking_rows("overall", self.db)["rows"]
        cached = main.cached_ranking_rows("overall", self.db)["rows"]
        self.assertEqual([(r["user_id"], r["points"]) for r in direct],
                         [(r["user_id"], r["points"]) for r in cached])

    def test_rounding_each_result_preserves_history_and_sorts_on_whole_points(self):
        self.upgrade()
        for participant_id, discipline_id, points in (
            (1, 319, "137.5"),
            (3, 318, "0.49"),
            (3, 319, "0.49"),
            (5, 319, "10.01"),
            (6, 319, "10.49"),
        ):
            result = self.db.query(DisciplineResult).filter_by(
                participant_id=participant_id, discipline_id=discipline_id,
            ).one()
            result.points = points
            if discipline_id == 319:
                result.result_data = json.dumps({"discipline": "dynamic-stage", "stage_points": points})
        self.db.commit()
        recorded = self.recorded_results()
        categories = ("discipline-319", "shotgun", "overall")
        payloads = {
            category: main.result_category_payload(self.competition, category, self.db)["shooters"]
            for category in categories
        }
        main.rebuild_ranking_entries(self.db)
        self.db.commit()
        self.assertEqual(self.recorded_results(), recorded)
        for category, payload in payloads.items():
            self.assertEqual(main.result_category_payload(self.competition, category, self.db)["shooters"], payload)
        for metric, expected in (("overall", "308"), ("shotgun", "308"), ("practical-shotgun", "138")):
            for region in ("", "mazowieckie"):
                direct = main.ranking_rows(metric, self.db, region)["rows"]
                cached = main.cached_ranking_rows(metric, self.db, region)["rows"]
                self.assertEqual([(r["user_id"], r["points"]) for r in direct],
                                 [(r["user_id"], r["points"]) for r in cached])
                self.assertEqual(next(r["points"] for r in cached if r["user_id"] == 1), expected)
                self.assertTrue(all("." not in r["points"] for r in cached))
                self.assertNotIn(3, [r["user_id"] for r in cached])
                tied = [r for r in cached if r["user_id"] in (5, 6)]
                self.assertEqual([(r["user_id"], r["points"]) for r in tied], [(5, "10"), (6, "10")])
        user = self.db.get(User, 1)
        self.assertEqual(main.user_competition_statistics(user, self.db)["total_points_sum"], "307.5")
        self.assertEqual(main.user_start_history(user, self.db)["total_points"], "307.5")

    def test_factor_rounding_zero_field_and_disqualification_reuse_existing_conversion(self):
        self.upgrade()
        discipline = self.db.get(Discipline, 316)
        discipline.discipline_type = "practical-shotgun"
        results = self.db.query(DisciplineResult).filter_by(discipline_id=316).order_by(DisciplineResult.participant_id).all()
        results[0].points = "1"
        results[1].points = "16"
        results[2].points = "100"
        results[2].result_data = json.dumps({"discipline": "practical-shotgun", "factor": "100", "disqualified": True})
        self.db.commit()
        converted = main.factor_points_by_result_id(results, {316: discipline}, self.db)
        self.assertEqual([converted[r.id] for r in results[:3]], [6, 100, 0])
        results[0].points = "2"
        self.db.commit()
        converted = main.factor_points_by_result_id(results, {316: discipline}, self.db)
        self.assertEqual(converted[results[0].id], 13)  # 12.5 rounds up.
        for result in results:
            result.points = "0"
        self.db.commit()
        self.assertTrue(all(value == 0 for value in main.factor_points_by_result_id(results, {316: discipline}, self.db).values()))

    def test_existing_cached_rankings_are_rebuilt_once_on_startup(self):
        self.upgrade()
        # Simulate the fractional rankings and cache version from the previous deploy.
        self.db.add(AppSetting(
            key="competition_derived_cache_version", value="2026-11-03-factor-ranking-points-v4",
        ))
        self.db.add(RankingEntry(
            scope="national", voivodeship="", metric="overall", metric_label="Ogólny",
            place=1, user_id=1, display_name="1 Jan", points="307.25", points_value="307.25",
            updated_at="2026-11-03",
        ))
        self.db.commit()
        recorded = self.recorded_results()
        with patch("main.SessionLocal", self.sessions):
            main.backfill_competition_derived_cache()
        self.db.expire_all()
        self.assertEqual(self.db.query(RankingEntry).filter_by(scope="national", metric="overall", user_id=1).one().points, "307")
        self.assertEqual(recorded, self.recorded_results())
        with patch("main.SessionLocal", self.sessions), patch("main.refresh_ranking_and_achievement_entries") as refresh:
            main.backfill_competition_derived_cache()
            refresh.assert_not_called()
