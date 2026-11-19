import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base
from models import Competition, ShootingRange, User

bootstrap = create_engine('sqlite://')
Base.metadata.create_all(bootstrap)
with patch('database.SessionLocal', sessionmaker(bind=bootstrap)):
    import main
bootstrap.dispose()


class CompetitionRangeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(email='organizer@example.test', organizer_name='Organizator', roles='organizer')
        self.db.add_all([self.user, ShootingRange(id=1, range_id='range-1', name='Strzelnica', address='Adres', phone='', website='', latitude=52.0, longitude=21.0, created_at='', updated_at='')])
        self.db.commit()
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)

    def data(self, **kwargs):
        return main.CompetitionData(name='Zawody', date='2099-01-01', location='Dowolny tekst', requires_licensed_judge=False, **kwargs)

    def test_create_requires_existing_range_and_uses_directory_data(self):
        for range_id in (None, 999):
            with self.subTest(range_id=range_id), self.assertRaises(HTTPException):
                main.create_competition(self.data(shooting_range_id=range_id), user=self.user, db=self.db)
        result = main.create_competition(self.data(shooting_range_id=1, latitude=1, longitude=2), user=self.user, db=self.db)
        event = self.db.get(Competition, result['competition_id'])
        self.assertEqual((event.shooting_range_id, event.location, event.latitude, event.longitude), (1, 'Strzelnica', 52.0, 21.0))
        main.update_competition(event.id, self.data(shooting_range_id=1, latitude=3, longitude=4), user=self.user, db=self.db)
        self.assertEqual((event.location, event.latitude, event.longitude), ('Strzelnica', 52.0, 21.0))
        with self.assertRaises(HTTPException):
            main.update_competition(event.id, self.data(), user=self.user, db=self.db)

    def test_legacy_edit_and_training_remain_available(self):
        legacy = Competition(name='Stare', date='2099-01-01', location='Stare miejsce', status='draft', created_by=self.user.email)
        self.db.add(legacy)
        self.db.commit()
        main.update_competition(legacy.id, self.data(), user=self.user, db=self.db)
        self.assertIsNone(legacy.shooting_range_id)
        main.update_competition(legacy.id, self.data(shooting_range_id=1), user=self.user, db=self.db)
        self.assertEqual(legacy.shooting_range_id, 1)
        training = self.data(event_type='training', description='Opis szkolenia')
        result = main.create_competition(training, user=self.user, db=self.db)
        self.assertEqual(self.db.get(Competition, result['competition_id']).location, 'Dowolny tekst')
