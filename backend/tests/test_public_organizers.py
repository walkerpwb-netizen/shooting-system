import unittest
from unittest.mock import patch
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base
from models import Competition, PublicOrganizer, User

bootstrap = create_engine("sqlite://")
Base.metadata.create_all(bootstrap)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap)):
    import main
bootstrap.dispose()


class PublicOrganizerTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.a = User(email="private-a@example.test", first_name="Sekret", organizer_name="Taka sama nazwa")
        self.b = User(email="private-b@example.test", organizer_name="Taka sama nazwa")
        self.db.add_all([self.a, self.b])
        self.db.add_all([
            Competition(id=1, name="Aktualne", date="2099-01-01", location="A", status="published", event_type="competition", created_by=self.a.email),
            Competition(id=2, name="Archiwalne", date="2020-01-01", location="B", status="completed", event_type="training", created_by=self.a.email),
            Competition(id=3, name="Szkic", date="2099-01-01", location="C", status="draft", event_type="competition", created_by=self.a.email),
            Competition(id=4, name="Cudze", date="2099-01-01", location="D", status="published", event_type="competition", created_by=self.b.email),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def save(self, user, ids, published=True, name="Taka sama nazwa", description="Opis zatwierdzony"):
        return main.save_public_organizer_settings(main.PublicOrganizerSettings(name=name, description=description, published=published, event_ids=ids), user, self.db)

    def test_opt_in_explicit_links_and_privacy(self):
        self.assertEqual(main.list_public_organizers(self.db), [])
        self.save(self.a, [1, 2, 3])
        self.save(self.b, [4])
        first = self.db.query(PublicOrganizer).filter_by(user_id=self.a.id).one()
        second = self.db.query(PublicOrganizer).filter_by(user_id=self.b.id).one()
        self.assertNotEqual(first.id, second.id)
        public = main.get_public_organizer(first.id, self.db)
        self.assertEqual({event["id"] for event in public["events"]}, {1, 2})
        self.assertNotIn("private", repr(public))
        self.assertNotIn("Sekret", repr(public))
        self.assertEqual(main.public_organizer_id_for_event(self.db.get(Competition, 1), self.db), first.id)
        self.assertIsNone(main.public_organizer_id_for_event(self.db.get(Competition, 3), self.db))
        self.save(self.a, [1, 2, 3])
        self.assertEqual({event["id"] for event in main.get_public_organizer(first.id, self.db)["events"]}, {1, 2})
        self.save(self.a, [2], published=False)
        self.assertIsNone(main.public_organizer_id_for_event(self.db.get(Competition, 1), self.db))
        with self.assertRaises(HTTPException) as error:
            main.get_public_organizer(first.id, self.db)
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(main.list_public_organizers(self.db), [{"id": second.id}])

    def test_cannot_claim_foreign_event_or_publish_without_content(self):
        with self.assertRaises(HTTPException): self.save(self.a, [4])
        with self.assertRaises(HTTPException): self.save(self.a, [], description="  ")
        self.assertEqual(self.db.query(PublicOrganizer).count(), 0)
        self.assertIsNone(self.db.get(Competition, 4).public_organizer_id)


if __name__ == "__main__": unittest.main()
