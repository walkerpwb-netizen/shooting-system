import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Competition, CompetitionParticipant, Discipline, ParticipantDiscipline, User


# main runs legacy backfills on import; never use the configured database here.
bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()


class CompetitionParticipationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(email="shooter@example.test")
        self.db.add_all([
            Competition(id=1, name="Test", date="2099-01-01", location="Test", status="published", created_by="organizer@example.test"),
            Competition(id=2, name="Other", date="2099-01-02", location="Test", status="published", created_by="organizer@example.test"),
        ])
        self.db.flush()
        self.db.add_all([
            Discipline(id=1, competition_id=1, name="Pistol", scoring_type="points", shots_count=10),
            Discipline(id=2, competition_id=1, name="Rifle", scoring_type="points", shots_count=10),
            Discipline(id=3, competition_id=2, name="Other", scoring_type="points", shots_count=10),
            CompetitionParticipant(id=1, competition_id=1, user_email=self.user.email, entry_type="shooter"),
            CompetitionParticipant(id=2, competition_id=1, user_email="other@example.test", entry_type="shooter"),
            CompetitionParticipant(id=3, competition_id=2, user_email=self.user.email, entry_type="shooter"),
        ])
        self.db.flush()
        self.db.add_all([
            ParticipantDiscipline(participant_id=1, discipline_id=1, ammo_type="own"),
            ParticipantDiscipline(participant_id=2, discipline_id=2, ammo_type="own"),
            ParticipantDiscipline(participant_id=3, discipline_id=3, ammo_type="own"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def entry(self, user=None, competition_id=1):
        return main.get_my_competition_entry(competition_id, user=user or self.user, db=self.db)

    def test_only_current_users_registered_disciplines_are_returned(self):
        self.assertEqual(self.entry()["discipline_ids"], [1])
        self.assertEqual(self.entry(competition_id=2)["discipline_ids"], [3])

    def test_registration_is_visible_before_check_in_and_after_completion(self):
        participant = self.db.get(CompetitionParticipant, 1)
        self.assertFalse(participant.checked_in)
        self.assertFalse(participant.paid)
        for status in ("published", "started", "completed"):
            with self.subTest(status=status):
                self.db.get(Competition, 1).status = status
                self.db.commit()
                self.assertEqual(self.entry()["discipline_ids"], [1])

    def test_judge_assignment_is_not_a_discipline_registration(self):
        participant = self.db.get(CompetitionParticipant, 1)
        participant.entry_type = "judge"
        participant.is_head_judge = 1
        self.db.commit()
        self.assertEqual(self.entry(), {
            "entry_type": "judge", "is_head_judge": True, "discipline_ids": [],
        })

    def test_missing_entry_and_removed_discipline_are_not_marked_as_joined(self):
        self.assertEqual(self.entry(user=User(email="guest@example.test")), {
            "entry_type": "", "discipline_ids": [],
        })
        self.db.query(ParticipantDiscipline).filter_by(participant_id=1).delete()
        self.db.commit()
        self.assertEqual(self.entry()["discipline_ids"], [])

    def test_shooter_registration_takes_precedence_over_judge_assignment(self):
        self.db.add(CompetitionParticipant(
            competition_id=1, user_email=self.user.email, entry_type="judge",
        ))
        self.db.commit()
        self.assertEqual(self.entry()["entry_type"], "shooter")
        self.assertEqual(self.entry()["discipline_ids"], [1])
