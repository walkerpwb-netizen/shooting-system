import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.responses import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import User


# main runs legacy backfills on import; isolate those from the configured DB too.
bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()


CREATED = "2026-10-16T16:39:39+00:00"
ACTIVATED = "2026-10-16T16:40:00+00:00"
SHOOTER = "2026-10-16T16:45:00+00:00"
LATER = "2026-10-17T10:00:00+00:00"
WELCOME_PREMIUM = "2026-12-31T23:59:59+01:00"


class UserLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = User(email="admin@example.test", role="admin", roles="admin")

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def register(self, club=False):
        data = {
            "email": "club@example.test" if club else "user@example.test",
            "password": "test-password",
            "terms_accepted": True,
            "privacy_policy_accepted": True,
            "results_publication_accepted": True,
            "form_started_at_ms": int(datetime.now(timezone.utc).timestamp() * 1000) - 10000,
        }
        if club:
            form = main.PzssClubRegisterData(
                **data, short_name="Klub testowy", full_name="Klub testowy PZSS",
                phone_number="123456789",
            )
            register = main.register_pzss_club
        else:
            form = main.RegisterData(**data)
            register = main.register
        with (
            patch("main.send_activation_email"),
            patch("main.notify_admin_about_registered_user"),
            patch("main.utc_now_iso", return_value=CREATED),
            patch("main.premium_end_of_year_iso", return_value=WELCOME_PREMIUM),
        ):
            register(form, db=self.db)
        return self.db.query(User).filter_by(email=data["email"]).one()

    def test_registration_records_creation_and_waits_for_activation(self):
        for club in (False, True):
            with self.subTest(club=club):
                user = self.register(club=club)
                self.db.refresh(user)
                self.assertEqual(user.created_at, CREATED)
                self.assertFalse(user.is_active)
                self.assertIsNone(user.activated_at)
                self.assertIsNone(user.shooter_since)
                self.assertEqual(user.premium_until, WELCOME_PREMIUM)

    def test_email_activation_records_time_for_users_and_clubs(self):
        for club in (False, True):
            with self.subTest(club=club):
                user = self.register(club=club)
                with patch("main.utc_now_iso", return_value=ACTIVATED):
                    main.activate_account(user.activation_token, Response(), db=self.db)
                self.db.refresh(user)
                self.assertTrue(user.is_active)
                self.assertEqual(user.created_at, CREATED)
                self.assertEqual(user.activated_at, ACTIVATED)
                self.assertIsNone(user.activation_token)
                self.assertIsNone(user.activation_expires_at)

    def test_admin_activation_preserves_first_activation_time(self):
        user = self.register()
        for timestamp in (ACTIVATED, LATER):
            with patch("main.utc_now_iso", return_value=timestamp):
                main.admin_activate_user(user.id, admin=self.admin, db=self.db)
            self.db.refresh(user)
            self.assertEqual(user.activated_at, ACTIVATED)

    def test_admin_created_account_is_activated_at_creation(self):
        with patch("main.utc_now_iso", return_value=CREATED), patch("main.premium_end_of_year_iso", return_value=WELCOME_PREMIUM):
            main.admin_create_user(
                main.AdminCreateUserData(email="manual@example.test", password="test-password"),
                admin=self.admin, db=self.db,
            )
        user = self.db.query(User).one()
        self.assertTrue(user.is_active)
        self.assertEqual(user.created_at, CREATED)
        self.assertEqual(user.activated_at, CREATED)
        self.assertIsNone(user.shooter_since)

        self.assertEqual(user.premium_until, WELCOME_PREMIUM)

    def test_welcome_premium_ends_in_2026_and_does_not_restart_in_2027(self):
        for current, expected in (
            (datetime(2026, 10, 26, tzinfo=main.APP_TIMEZONE), WELCOME_PREMIUM),
            (datetime(2026, 12, 31, 23, 59, 59, tzinfo=main.APP_TIMEZONE), WELCOME_PREMIUM),
            (datetime(2027, 1, 1, tzinfo=main.APP_TIMEZONE), None),
        ):
            with self.subTest(current=current), patch("main.datetime", wraps=datetime) as clock:
                clock.now.return_value = current
                self.assertEqual(main.premium_end_of_year_iso(), expected)

    def test_profile_completion_records_shooter_time_once(self):
        user = self.register()
        main.admin_activate_user(user.id, admin=self.admin, db=self.db)
        profile = main.ProfileData(
            first_name="Jan", last_name="Testowy", birth_date="1990-01-01",
            voivodeship="mazowieckie", no_club=True, no_license=True,
        )
        for timestamp in (SHOOTER, LATER):
            with patch("main.utc_now_iso", return_value=timestamp):
                main.update_me(profile, user=user, db=self.db)
            self.db.refresh(user)
            self.assertIn("shooter", main.get_user_roles(user))
            self.assertEqual(user.shooter_since, SHOOTER)

    def test_admin_role_changes_preserve_first_shooter_time(self):
        user = self.register()
        for roles, timestamp in (
            (["shooter"], SHOOTER), (["shooter", "organizer"], LATER),
            (["user"], LATER), (["shooter"], LATER),
        ):
            with patch("main.utc_now_iso", return_value=timestamp):
                main.admin_update_user_role(
                    user.id, main.UserRoleData(roles=roles), admin=self.admin, db=self.db,
                )
            self.db.refresh(user)
            self.assertEqual(user.shooter_since, SHOOTER)

    def test_legacy_accounts_do_not_get_invented_dates(self):
        user = User(email="legacy@example.test", is_active=1, role="shooter", roles="user,shooter")
        self.db.add(user)
        self.db.commit()
        main.admin_activate_user(user.id, admin=self.admin, db=self.db)
        main.admin_update_user_role(
            user.id, main.UserRoleData(roles=["shooter", "organizer"]),
            admin=self.admin, db=self.db,
        )
        self.db.refresh(user)
        self.assertIsNone(user.created_at)
        self.assertIsNone(user.activated_at)
        self.assertIsNone(user.shooter_since)

    def test_info_endpoint_displays_all_dates_in_polish_time(self):
        user = self.register()
        user.activated_at = ACTIVATED
        user.shooter_since = SHOOTER
        self.db.commit()
        info = main.admin_get_user_info(user.id, admin=self.admin, db=self.db)
        rows = {row["label"]: row["value"] for row in info["sections"][0]["rows"]}
        self.assertEqual(rows["Data założenia konta"], "16.10.2026 18:39:39 (czas polski)")
        self.assertEqual(rows["Data aktywacji konta"], "16.10.2026 18:40:00 (czas polski)")
        self.assertEqual(rows["Data uzyskania roli strzelca"], "16.10.2026 18:45:00 (czas polski)")

    def test_date_format_handles_winter_time_and_missing_history(self):
        self.assertEqual(
            main.admin_user_info_datetime("2026-12-16T16:39:39Z"),
            "16.12.2026 17:39:39 (czas polski)",
        )
        for value in (None, "", "invalid"):
            with self.subTest(value=value):
                self.assertEqual(main.admin_user_info_datetime(value), "brak danych")


if __name__ == "__main__":
    unittest.main()
