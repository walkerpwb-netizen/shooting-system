import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import (
    Achievement, AppSetting, Competition, CompetitionParticipant, Discipline,
    DisciplineResult, ParticipantDiscipline, User,
)


# Importing main runs legacy backfills; isolate them from the configured database.
bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()


class AchievementTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.sessions()
        self.competition = Competition(
            id=1, name="Historical", date="2026-07-11", location="Test",
            created_by="organizer@example.test", status="completed",
            completed_at="2026-07-11T17:00:00+02:00",
        )
        self.db.add(self.competition)
        self.db.flush()
        self.db.add_all([
            Discipline(id=1, competition_id=1, name="Pistol", discipline_type="pistol-sport-25m", scoring_type="points", shots_count=10),
            Discipline(id=2, competition_id=1, name="Rifle", discipline_type="rifle-sport-50m-60-prone", scoring_type="points", shots_count=10),
            Discipline(id=3, competition_id=1, name="Shotgun", discipline_type="trap", scoring_type="points", shots_count=10),
        ])
        for participant_id in range(1, 11):
            email = f"shooter-{participant_id}@example.test"
            self.db.add(User(
                email=email, first_name="Jan", last_name=f"Test {participant_id}",
                birth_date="1990-01-01", voivodeship="mazowieckie",
                no_club=1, no_license=1,
            ))
            self.db.add(CompetitionParticipant(
                id=participant_id, competition_id=1, user_email=email,
                first_name="Jan", last_name=f"Test {participant_id}",
                entry_type="shooter", checked_in=1, paid=1,
            ))
        self.db.flush()
        top_scores = {1: [100, 90, 80], 2: [90, 100, 80], 3: [80, 90, 100]}
        for discipline_id in range(1, 4):
            for participant_id in range(1, 11):
                points = top_scores[discipline_id][participant_id - 1] if participant_id <= 3 else 100 - participant_id * 10
                self.db.add(ParticipantDiscipline(
                    participant_id=participant_id, discipline_id=discipline_id, ammo_type="own",
                ))
                self.db.add(DisciplineResult(
                    competition_id=1, participant_id=participant_id, discipline_id=discipline_id,
                    points=str(points), judge_email="judge@example.test",
                ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def award(self):
        count = main.award_achievements_for_competition(self.competition, self.db)
        self.db.commit()
        return count

    def change_pistol_scores(self, scores):
        for participant_id, points in enumerate(scores, start=1):
            self.db.query(DisciplineResult).filter_by(
                participant_id=participant_id, discipline_id=1,
            ).one().points = str(points)
        self.db.commit()

    def test_individual_medals_have_weapon_icons_and_direct_result_links(self):
        self.assertEqual(self.award(), 21)
        for discipline_id, badge_type in ((1, "pistol"), (2, "rifle"), (3, "shotgun")):
            category_id = f"discipline-{discipline_id}"
            awards = self.db.query(Achievement).filter_by(category_id=category_id).order_by(Achievement.place).all()
            self.assertEqual([a.medal for a in awards], ["gold", "silver", "bronze"])
            self.assertTrue(all(a.badge_type == badge_type for a in awards))
            self.assertTrue(all(a.historical_path == f"/historical-results/1/{category_id}" for a in awards))
            self.assertTrue(all(a.awarded_at == self.competition.completed_at for a in awards))
        own = main.user_achievements("shooter-2@example.test", self.db)
        self.assertIn(("overall", "gold"), [(a["category_id"], a["medal"]) for a in own])
        self.assertIn(("discipline-1", "silver"), [(a["category_id"], a["medal"]) for a in own])

    def test_every_tied_podium_finisher_gets_the_medal_for_their_actual_place(self):
        for scores, expected in (
            ([100, 90, 80, 80, 80], [(1, "gold"), (2, "silver"), (3, "bronze"), (4, "bronze"), (5, "bronze")]),
            ([100, 90, 90, 90, 60], [(1, "gold"), (2, "silver"), (3, "silver"), (4, "silver")]),
            ([100, 100, 100, 100, 60], [(1, "gold"), (2, "gold"), (3, "gold"), (4, "gold")]),
        ):
            with self.subTest(scores=scores):
                self.change_pistol_scores(scores)
                self.award()
                for category_id in ("discipline-1", "pistol"):
                    awards = self.db.query(Achievement.participant_id, Achievement.medal).filter_by(category_id=category_id).order_by(Achievement.participant_id).all()
                    self.assertEqual([(a.participant_id, a.medal) for a in awards], expected)

    def test_recalculation_replaces_stale_medals_without_duplicates(self):
        self.award()
        self.change_pistol_scores([80, 90, 100])
        self.award()
        self.assertEqual(self.award(), 21)
        self.assertEqual(self.db.query(Achievement).count(), 21)
        award = self.db.query(Achievement).filter_by(category_id="discipline-1", participant_id=1).one()
        self.assertEqual((award.place, award.medal, award.points), (3, "bronze", "80"))

    def test_account_requirements_do_not_promote_fourth_place_to_podium(self):
        self.db.query(User).filter_by(email="shooter-2@example.test").delete()
        self.db.query(User).filter_by(email="shooter-3@example.test").one().birth_date = ""
        self.db.commit()
        self.award()
        awards = self.db.query(Achievement).filter_by(category_id="discipline-1").all()
        self.assertEqual([(a.participant_id, a.place) for a in awards], [(1, 1)])

    def test_minimum_participant_count_and_completed_status_still_apply(self):
        self.db.query(ParticipantDiscipline).filter_by(participant_id=10, discipline_id=1).delete()
        self.db.commit()
        self.award()
        self.assertEqual(self.db.query(Achievement).filter_by(category_id="discipline-1").count(), 0)
        self.competition.status = "started"
        self.assertEqual(self.award(), 0)
        self.assertEqual(self.db.query(Achievement).count(), 0)

    def test_startup_backfill_updates_old_historical_awards_once(self):
        self.db.add(AppSetting(key="competition_derived_cache_version", value="2026-06-27-ranking-achievements-v2"))
        self.db.commit()
        with patch("main.SessionLocal", self.sessions):
            main.backfill_competition_derived_cache()
        self.db.expire_all()
        self.assertEqual(self.db.query(Achievement).count(), 21)
        with patch("main.SessionLocal", self.sessions), patch("main.refresh_ranking_and_achievement_entries") as refresh:
            main.backfill_competition_derived_cache()
            refresh.assert_not_called()
