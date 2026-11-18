import base64
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from PIL import Image

from event_logos import materialize_event_logo


class EventLogoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / "logos"
        stream = BytesIO()
        Image.new("RGB", (2, 2), "red").save(stream, format="JPEG")
        self.image = stream.getvalue()
        self.uri = "data:image/jpeg;base64," + base64.b64encode(self.image).decode()

    def test_public_asset_is_content_addressed_and_recreated(self):
        url = materialize_event_logo(self.uri, self.directory)
        self.assertTrue(url.startswith('/api/uploads/event-logos/'))
        path = self.directory / url.rsplit('/', 1)[1]
        self.assertEqual(path.read_bytes(), self.image)
        path.unlink()
        self.assertEqual(materialize_event_logo(self.uri, self.directory), url)
        self.assertEqual(path.read_bytes(), self.image)

    def test_invalid_and_mismatched_images_are_rejected(self):
        for value in ("data:image/jpeg;base64,invalid", self.uri.replace("image/jpeg", "image/png"),
                      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="):
            with self.subTest(value=value[:30]), self.assertRaises(ValueError):
                materialize_event_logo(value, self.directory)

    def test_existing_url_and_empty_logo_are_unchanged(self):
        self.assertEqual(materialize_event_logo('/some/logo.png', self.directory), '/some/logo.png')
        self.assertEqual(materialize_event_logo('', self.directory), '')

class EventLogoFlowTests(unittest.TestCase):
    def test_create_edit_and_public_detail_keep_original_and_serve_file(self):
        from unittest.mock import patch
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from database import Base
        from models import Competition, User

        engine = create_engine('sqlite://')
        Base.metadata.create_all(engine)
        with patch('database.SessionLocal', sessionmaker(bind=engine)):
            import main
        session = sessionmaker(bind=engine)()
        self.addCleanup(engine.dispose)
        self.addCleanup(session.close)
        user = User(email='organizer@example.test', organizer_name='Organizator', roles='organizer')
        session.add(user)
        session.commit()
        stream = BytesIO()
        Image.new('RGB', (2, 2), 'blue').save(stream, format='PNG')
        content = stream.getvalue()
        logo = 'data:image/png;base64,' + base64.b64encode(content).decode()
        data = main.CompetitionData(name='Test', date='2099-01-01', location='Test',
                                    organizer_logo=logo, sponsor_logo=logo,
                                    requires_licensed_judge=False)
        with tempfile.TemporaryDirectory() as folder, patch.object(main, 'EVENT_LOGO_DIR', Path(folder)):
            created = main.create_competition(data, user=user, db=session)
            record = session.get(Competition, created['competition_id'])
            self.assertEqual(record.organizer_logo, logo)
            detail = main.public_competition_detail_row(record, current_user=None, db=session)
            self.assertTrue(detail['organizer_logo'].startswith('/api/uploads/event-logos/'))
            self.assertEqual((Path(folder) / detail['organizer_logo'].rsplit('/', 1)[1]).read_bytes(), content)
            data.name = 'Zmienione'
            main.update_competition(record.id, data, user=user, db=session)
            self.assertEqual(record.organizer_logo, logo)
            self.assertEqual(record.sponsor_logo, logo)


if __name__ == '__main__':
    unittest.main()
