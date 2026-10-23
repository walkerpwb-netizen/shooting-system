from datetime import datetime
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Competition, CompetitionParticipant, Discipline, DisciplineResult, ParticipantDiscipline, User


# main runs legacy backfills on import; never use the configured database here.
bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()


class LicenseStartsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(email="shooter@example.test", license_number="12345", role="shooter")
        self.db.add(self.user)
        self.db.commit()
        self.clock = patch("main.datetime", wraps=datetime)
        self.mock_datetime = self.clock.start()
        self.mock_datetime.now.return_value = datetime(2026, 10, 23, tzinfo=main.APP_TIMEZONE)
        self.addCleanup(self.clock.stop)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_start(self, firearm="pistol", date="2026-06-01", status="completed",
                  email=None, entry_type="shooter", points="0", recorded=True):
        competition = Competition(
            name="Test", date=date, status=status, location="Test",
            created_by="organizer@example.test", completed_at="2026-10-22T12:00:00+02:00",
        )
        self.db.add(competition)
        self.db.flush()
        discipline = Discipline(
            competition_id=competition.id, name="Test", discipline_type=firearm,
            scoring_type="points", shots_count=10,
        )
        participant = CompetitionParticipant(
            competition_id=competition.id, user_email=email or self.user.email,
            entry_type=entry_type,
        )
        self.db.add_all([discipline, participant])
        self.db.flush()
        self.db.add(ParticipantDiscipline(
            participant_id=participant.id, discipline_id=discipline.id, ammo_type="own",
        ))
        if recorded:
            self.db.add(DisciplineResult(
                competition_id=competition.id, discipline_id=discipline.id,
                participant_id=participant.id, judge_email="judge@example.test", points=points,
            ))
        self.db.commit()
        return competition, discipline, participant

    def status(self):
        return main.user_license_starts(self.user, self.db)

    def test_missing_license_no_license_and_club_accounts_hide_the_status(self):
        for changes in (
            {"license_number": ""}, {"license_number": "   "},
            {"license_number": "12345", "no_license": 1},
            {"license_number": "12345", "no_license": 0, "account_type": "pzss_club"},
        ):
            with self.subTest(changes=changes):
                for key, value in changes.items():
                    setattr(self.user, key, value)
                self.assertIsNone(self.status())

    def test_licensed_shooter_without_starts_has_full_deficits(self):
        status = self.status()
        self.assertEqual(status["year"], 2026)
        self.assertFalse(status["complete"])
        self.assertEqual({key: row["missing"] for key, row in status["categories"].items()},
                         {"pistol": 4, "rifle": 2, "shotgun": 2})

    def test_counts_zero_point_results_and_detailed_firearm_types_without_premium(self):
        for firearm in ("pistol-sport-25m", "ipsc-pistol", "pistol", "pistol",
                        "rifle-air-10m", "pcc", "trap", "practical-shotgun"):
            self.add_start(firearm)
        status = self.status()
        self.assertTrue(status["complete"])
        self.assertEqual([row["completed"] for row in status["categories"].values()], [4, 2, 2])
        self.add_start("pistol")
        self.assertEqual(self.status()["categories"]["pistol"],
                         {"required": 4, "completed": 5, "missing": 0})

    def test_partial_progress_reports_each_shortfall(self):
        for firearm in ("pistol", "pistol", "rifle"):
            self.add_start(firearm)
        status = self.status()
        self.assertFalse(status["complete"])
        self.assertEqual({key: row["missing"] for key, row in status["categories"].items()},
                         {"pistol": 2, "rifle": 1, "shotgun": 2})

    def test_uses_event_year_not_completion_year_and_supports_both_date_formats(self):
        for date in ("2025-12-31", "2027-01-01", "2026-12-01", "invalid"):
            self.add_start(date=date)
        for date in ("2026-01-01", "23.10.2026"):
            self.add_start(date=date)
        self.assertEqual(self.status()["categories"]["pistol"]["completed"], 2)
        self.mock_datetime.now.return_value = datetime(2027, 1, 1, tzinfo=main.APP_TIMEZONE)
        self.assertEqual(self.status()["year"], 2027)
        self.assertEqual(self.status()["categories"]["pistol"]["completed"], 1)
        self.mock_datetime.now.assert_called_with(main.APP_TIMEZONE)

    def test_registration_unfinished_events_and_other_people_do_not_count(self):
        self.add_start(recorded=False)
        self.add_start(points="   ")
        for status in ("draft", "published", "started", "cancelled"):
            self.add_start(status=status)
        self.add_start(email="other@example.test")
        self.add_start(entry_type="judge")
        self.add_start(firearm="historical-shooting")
        self.assertTrue(all(row["completed"] == 0 for row in self.status()["categories"].values()))

    def test_multiple_disciplines_in_one_event_count_but_duplicate_entries_do_not(self):
        competition, discipline, _ = self.add_start(entry_type=None)
        participant = CompetitionParticipant(
            competition_id=competition.id, user_email=self.user.email, entry_type="shooter",
        )
        other_discipline = Discipline(
            competition_id=competition.id, name="Other pistol", discipline_type="pistol",
            scoring_type="points", shots_count=10,
        )
        self.db.add_all([participant, other_discipline])
        self.db.flush()
        for item in (discipline, other_discipline):
            self.db.add(DisciplineResult(
                competition_id=competition.id, discipline_id=item.id, participant_id=participant.id,
                judge_email="judge@example.test", points="50",
            ))
        self.db.commit()
        self.assertEqual(self.status()["categories"]["pistol"]["completed"], 2)

    def test_recalculates_when_results_are_removed_or_event_reopened(self):
        competition, discipline, _ = self.add_start()
        self.assertEqual(self.status()["categories"]["pistol"]["completed"], 1)
        competition.status = "started"
        self.db.commit()
        self.assertEqual(self.status()["categories"]["pistol"]["completed"], 0)
        competition.status = "completed"
        self.db.query(DisciplineResult).filter_by(discipline_id=discipline.id).delete()
        self.db.commit()
        self.assertEqual(self.status()["categories"]["pistol"]["completed"], 0)

    def test_own_profile_and_saved_profile_responses_include_status(self):
        self.assertEqual(main.get_me(user=self.user, db=self.db)["license_starts"], self.status())
        self.assertEqual(main.private_user_response(self.user, self.db)["license_starts"], self.status())

    def test_user_profile_respects_existing_privacy_rules(self):
        for viewer in (None, User(email="other@example.test", role="shooter")):
            response = main.user_profile_response(self.user, viewer, self.db)
            self.assertNotIn("license_starts", response)
        for viewer in (self.user, User(email="admin@example.test", role="admin")):
            response = main.user_profile_response(self.user, viewer, self.db)
            self.assertEqual(response["license_starts"], self.status())

    def test_participant_profile_respects_existing_privacy_rules(self):
        _, _, participant = self.add_start()
        for viewer in (None, User(email="other@example.test", role="shooter")):
            response = main.get_participant_profile(participant.id, current_user=viewer, db=self.db)
            self.assertNotIn("license_starts", response)
        for viewer in (self.user, User(email="admin@example.test", role="admin")):
            response = main.get_participant_profile(participant.id, current_user=viewer, db=self.db)
            self.assertEqual(response["license_starts"], self.status())
