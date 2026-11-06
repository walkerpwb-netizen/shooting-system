import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from database import Base
from models import PremiumOrder, User
from premium_access import (
    PREMIUM_TIMEZONE, add_premium_period, apply_paid_premium_order,
    effective_premium_until, effective_premium_until_iso, included_premium_packages,
    premium_display_fields,
)

# main runs legacy backfills on import; keep those off the configured database.
bootstrap_engine = create_engine("sqlite://")
Base.metadata.create_all(bootstrap_engine)
with patch("database.SessionLocal", sessionmaker(bind=bootstrap_engine)):
    import main
bootstrap_engine.dispose()


class PremiumAccessTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.user = User(email="premium@example.test", role="user", is_active=1,
                         premium_until=None, premium_disabled=0, premium_organizer_disabled=0)
        self.db.add(self.user)
        self.db.commit()
        self.paid_at = datetime.now(PREMIUM_TIMEZONE).replace(microsecond=0)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def order(self, package="organizer", period="yearly", environment="production", status="paid"):
        order = PremiumOrder(
            id=uuid4().hex, user_id=self.user.id, package=package, period=period,
            amount="123.45", currency="PLN", environment=environment, service_id="12345",
            status=status, created_at=self.paid_at.isoformat(), paid_at=self.paid_at.isoformat(),
            terms_version="test", terms_accepted_at=self.paid_at.isoformat(), offer_snapshot="{}",
        )
        self.db.add(order)
        self.db.commit()
        return order

    def apply(self, order):
        changed = apply_paid_premium_order(order, self.db)
        self.db.commit()
        return changed

    def test_annual_organizer_purchase_activates_both_packages_with_the_same_expiry(self):
        order = self.order()
        self.assertTrue(self.apply(order))
        end = add_premium_period(self.paid_at, "yearly")
        self.assertEqual(effective_premium_until(self.user, "organizer"), end)
        self.assertEqual(effective_premium_until(self.user, "shooter"), end)
        self.assertEqual(order.entitlement_starts_at, self.paid_at.isoformat())
        self.assertEqual(order.entitlement_ends_at, end.isoformat())
        self.assertTrue(main.has_active_organizer_premium(self.user))
        self.assertTrue(main.has_active_premium(self.user))
        profile = main.public_user(self.user)
        self.assertEqual(profile["premium_until"], profile["premium_organizer_until"])
        self.assertIsNone(self.user.premium_until)

    def test_later_independent_shooter_expiry_is_preserved(self):
        longer = self.paid_at + timedelta(days=800)
        self.user.premium_shooter_paid_until = longer.isoformat()
        self.db.commit()
        self.apply(self.order())
        self.assertEqual(effective_premium_until(self.user), longer)
        self.assertLess(effective_premium_until(self.user, "organizer"), longer)
        self.assertEqual(self.user.premium_shooter_paid_until, longer.isoformat())

    def test_shooter_purchase_does_not_grant_organizer_access(self):
        for period in ("monthly", "yearly"):
            with self.subTest(period=period):
                self.apply(self.order(package="shooter", period=period))
                self.assertTrue(main.has_active_premium(self.user))
                self.assertFalse(main.has_active_organizer_premium(self.user))
                self.assertEqual(effective_premium_until_iso(self.user, "organizer"), "")

    def test_single_publication_does_not_grant_timed_premium_or_shooter_bonus(self):
        self.assertFalse(self.apply(self.order(period="monthly")))
        self.assertFalse(main.has_active_premium(self.user))
        self.assertFalse(main.has_active_organizer_premium(self.user))

    def test_unknown_environment_pending_and_failed_orders_never_grant_entitlements(self):
        for environment, status in (("retired", "paid"), ("production", "pending"), ("production", "failed")):
            with self.subTest(environment=environment, status=status):
                order = self.order(environment=environment, status=status)
                self.assertFalse(self.apply(order))
                self.assertIsNone(order.entitlements_applied_at)
                self.assertFalse(main.has_active_premium(self.user))
                self.assertFalse(main.has_active_organizer_premium(self.user))

    def test_repeated_fulfillment_cannot_extend_either_package_twice(self):
        order = self.order()
        self.assertTrue(self.apply(order))
        end, applied = order.entitlement_ends_at, order.entitlements_applied_at
        for _ in range(3):
            self.assertFalse(self.apply(order))
            self.assertEqual(effective_premium_until_iso(self.user), end)
            self.assertEqual(order.entitlements_applied_at, applied)

    def test_renewal_extends_both_packages_by_the_same_year(self):
        first = self.order()
        self.apply(first)
        first_end = effective_premium_until(self.user, "organizer")
        second = self.order()
        self.apply(second)
        end = add_premium_period(first_end, "yearly")
        self.assertEqual(effective_premium_until(self.user, "organizer"), end)
        self.assertEqual(effective_premium_until(self.user), end)
        self.assertFalse(self.apply(first))
        self.assertEqual(effective_premium_until(self.user), end)

    def test_legacy_access_and_admin_overrides_are_preserved(self):
        legacy = self.paid_at + timedelta(days=30)
        self.user.premium_until = legacy.isoformat()
        self.db.commit()
        self.assertTrue(main.has_active_premium(self.user))
        self.assertTrue(main.has_active_organizer_premium(self.user))
        self.apply(self.order())
        self.assertEqual(effective_premium_until(self.user), add_premium_period(legacy, "yearly"))
        self.assertEqual(self.user.premium_until, legacy.isoformat())
        self.user.premium_disabled = 1
        self.assertFalse(main.has_active_premium(self.user))
        self.assertTrue(main.has_active_organizer_premium(self.user))
        self.user.premium_organizer_disabled = 1
        self.assertFalse(main.has_active_organizer_premium(self.user))

    def test_calendar_month_and_leap_year_boundaries(self):
        for start, period, expected in (
            ("2028-02-29T12:00:00+01:00", "yearly", "2029-02-28T12:00:00+01:00"),
            ("2027-01-31T12:00:00+01:00", "monthly", "2027-02-28T12:00:00+01:00"),
        ):
            self.assertEqual(add_premium_period(datetime.fromisoformat(start), period).isoformat(), expected)

    def test_expired_and_malformed_dates_do_not_enable_access(self):
        self.user.premium_until = "invalid"
        self.user.premium_shooter_paid_until = "invalid"
        self.user.premium_organizer_paid_until = (self.paid_at - timedelta(days=1)).isoformat()
        self.assertFalse(main.has_active_premium(self.user))
        self.assertFalse(main.has_active_organizer_premium(self.user))
        self.assertIsNone(effective_premium_until(None))

    def test_bundle_rule_is_exposed_by_the_existing_premium_settings_api(self):
        settings = main.get_public_premium_settings(db=self.db)
        self.assertEqual(settings["organizer"]["yearly_included_packages"], ["organizer", "shooter"])
        self.assertEqual(settings["shooter"]["yearly_included_packages"], ["shooter"])
        self.assertEqual(included_premium_packages("organizer", "monthly"), [])

    def test_paid_order_without_payment_timestamp_does_not_grant_access(self):
        order = self.order()
        order.paid_at = None
        self.db.commit()
        with self.assertRaises(ValueError):
            apply_paid_premium_order(order, self.db)
        self.assertIsNone(self.user.premium_organizer_paid_until)

    def test_fulfillment_uses_just_verified_status_in_the_same_transaction(self):
        order = self.order(status="pending")
        order.status = "paid"
        self.assertTrue(self.apply(order))
        self.assertEqual(order.status, "paid")
        self.assertTrue(main.has_active_premium(self.user))
        self.assertTrue(main.has_active_organizer_premium(self.user))

    def scheduled_order(self, package="shooter", period="monthly", start=None, status="paid", environment="production"):
        order = self.order(package=package, period=period, status=status, environment=environment)
        order.service_starts_at = (start or self.paid_at + timedelta(days=55)).astimezone(PREMIUM_TIMEZONE).isoformat()
        order.service_ends_at = add_premium_period(datetime.fromisoformat(order.service_starts_at).astimezone(PREMIUM_TIMEZONE), period).isoformat()
        self.db.commit()
        return order

    def test_paid_renewal_is_visible_now_and_is_not_added_twice_when_activated(self):
        active_end = self.paid_at + timedelta(days=55)
        self.user.premium_until = active_end.isoformat()
        order = self.scheduled_order(start=active_end)
        purchased_end = order.service_ends_at
        for _ in range(3):
            profile = main.public_user(self.user)
            self.assertEqual(profile["premium_coverage_until"], purchased_end)
            self.assertEqual(profile["premium_organizer_coverage_until"], active_end.isoformat())
            self.assertEqual(profile["premium_until"], active_end.isoformat())
            self.assertEqual(profile["premium_scheduled_ends_at"], purchased_end)
        self.assertIsNone(self.user.premium_shooter_paid_until)
        self.assertIsNone(order.entitlements_applied_at)
        self.assertFalse(self.apply(order))
        # Showing the future purchase must not move the fulfillment base forward.
        with patch("premium_access.datetime", wraps=datetime) as clock:
            clock.now.return_value = active_end + timedelta(seconds=1)
            self.assertEqual(main.public_user(self.user)["premium_coverage_until"], purchased_end)
            self.assertTrue(self.apply(order))
        self.assertEqual(self.user.premium_shooter_paid_until, purchased_end)
        self.assertFalse(self.apply(order))
        self.assertEqual(main.public_user(self.user)["premium_coverage_until"], purchased_end)

    def test_displayed_coverage_chains_paid_periods_and_drops_refunded_renewal(self):
        active_end = self.paid_at + timedelta(days=55)
        self.user.premium_until = active_end.isoformat()
        first = self.scheduled_order(start=active_end)
        second = self.scheduled_order(start=datetime.fromisoformat(first.service_ends_at))
        third = self.scheduled_order(start=datetime.fromisoformat(second.service_ends_at))
        result = premium_display_fields(self.user, orders=[third, first, second])
        self.assertEqual(result["premium_coverage_until"], third.service_ends_at)
        first.refunded_at = self.paid_at.isoformat(); self.db.commit()
        self.assertEqual(main.public_user(self.user)["premium_coverage_until"], active_end.isoformat())

    def test_future_paid_purchase_does_not_grant_access_or_bridge_a_gap(self):
        order = self.scheduled_order(start=self.paid_at + timedelta(days=14))
        for active_end in (None, self.paid_at - timedelta(days=1)):
            self.user.premium_until = active_end.isoformat() if active_end else None
            self.db.commit()
            profile = main.public_user(self.user)
            self.assertEqual(profile["premium_coverage_until"], self.user.premium_until or "")
            self.assertEqual(profile["premium_scheduled_starts_at"], order.service_starts_at)
            self.assertEqual(profile["premium_scheduled_ends_at"], order.service_ends_at)
            self.assertFalse(main.has_active_premium(self.user))
        self.user.premium_until = (self.paid_at + timedelta(days=3)).isoformat(); self.db.commit()
        self.assertEqual(main.public_user(self.user)["premium_coverage_until"], self.user.premium_until)

    def test_unpaid_foreign_retired_and_single_publication_orders_do_not_extend_display(self):
        active_end = self.paid_at + timedelta(days=55)
        self.user.premium_until = active_end.isoformat()
        for status in ("pending", "failed", "cancelled"):
            self.scheduled_order(status=status)
        self.scheduled_order(environment="retired")
        self.scheduled_order(package="organizer", period="monthly")
        foreign = self.scheduled_order()
        another_user = User(email="foreign@example.test", is_active=1)
        self.db.add(another_user); self.db.flush()
        foreign.user_id = another_user.id
        self.db.commit()
        self.assertEqual(premium_display_fields(self.user, orders=[foreign])["premium_coverage_until"], active_end.isoformat())
        profile = main.public_user(self.user)
        self.assertEqual(profile["premium_coverage_until"], active_end.isoformat())
        self.assertEqual(profile["premium_scheduled_ends_at"], "")

    def test_scheduled_organizer_year_includes_shooter_without_shortening_longer_access(self):
        active_end = self.paid_at + timedelta(days=55)
        self.user.premium_until = active_end.isoformat()
        order = self.scheduled_order(package="organizer", period="yearly", start=active_end)
        profile = main.public_user(self.user)
        self.assertEqual(profile["premium_coverage_until"], order.service_ends_at)
        self.assertEqual(profile["premium_organizer_coverage_until"], order.service_ends_at)
        longer = (active_end + timedelta(days=800)).isoformat()
        self.user.premium_shooter_paid_until = longer; self.db.commit()
        self.assertEqual(main.public_user(self.user)["premium_coverage_until"], longer)
        self.user.premium_disabled = 1
        self.assertFalse(main.has_active_premium(self.user))

    def test_admin_list_and_info_show_renewal_and_batch_the_order_lookup(self):
        active_end = self.paid_at + timedelta(days=55)
        self.user.premium_until = active_end.isoformat()
        order = self.scheduled_order(start=active_end)
        for index in range(10):
            self.db.add(User(email=f"other-{index}@example.test", is_active=1, role="user"))
        self.db.commit()
        queries = []
        def track(connection, cursor, statement, parameters, context, executemany):
            if "from premium_orders" in statement.lower():
                queries.append(statement)
        event.listen(self.engine, "before_cursor_execute", track)
        try:
            users = main.admin_get_users(admin=self.user, db=self.db)
        finally:
            event.remove(self.engine, "before_cursor_execute", track)
        self.assertEqual(len(queries), 1)
        row = next(row for row in users if row["id"] == self.user.id)
        self.assertEqual(row["premium_coverage_until"], order.service_ends_at)
        info = main.admin_user_profile_info(self.user)
        rows = [row for section in info["sections"] for row in section["rows"]]
        self.assertEqual(next(row["value"] for row in rows if row["label"] == "Premium Strzelca do (z opłaconymi przedłużeniami)"), order.service_ends_at)


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "TEST_POSTGRES_URL is not configured")
class PostgresPremiumFulfillmentTests(unittest.TestCase):
    def setUp(self):
        self.schema = "premium_test_" + uuid4().hex
        self.admin_engine = create_engine(os.environ["TEST_POSTGRES_URL"])
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.engine = create_engine(
            os.environ["TEST_POSTGRES_URL"],
            connect_args={"options": f"-csearch_path={self.schema} -cstatement_timeout=10000"},
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.sessions()
        self.user = User(email="premium-concurrent@example.test", is_active=1)
        self.db.add(self.user)
        self.db.commit()
        self.paid_at = datetime.now(PREMIUM_TIMEZONE).replace(microsecond=0)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.admin_engine.dispose()

    def order_id(self):
        order = PremiumOrder(
            id=uuid4().hex, user_id=self.user.id, package="organizer", period="yearly",
            amount="123.45", currency="PLN", environment="production", service_id="12345",
            status="paid", created_at=self.paid_at.isoformat(), paid_at=self.paid_at.isoformat(),
            terms_version="test", terms_accepted_at=self.paid_at.isoformat(), offer_snapshot="{}",
        )
        self.db.add(order)
        self.db.commit()
        return order.id

    def apply_concurrently(self, order_ids):
        barrier = Barrier(len(order_ids))
        user_id = self.user.id

        def fulfill(order_id):
            with self.sessions() as db:
                # Cache stale state before contenders finish: locks must refresh it.
                order = db.get(PremiumOrder, order_id)
                cached_user = db.get(User, user_id)
                barrier.wait(timeout=10)
                changed = apply_paid_premium_order(order, db)
                self.assertIsNotNone(cached_user)
                db.commit()
                return changed

        with ThreadPoolExecutor(max_workers=len(order_ids)) as pool:
            results = list(pool.map(fulfill, order_ids))
        self.db.expire_all()
        return results

    def test_concurrent_notifications_for_same_order_grant_both_packages_once(self):
        order_id = self.order_id()
        self.assertEqual(sum(self.apply_concurrently([order_id] * 4)), 1)
        end = add_premium_period(self.paid_at, "yearly")
        self.assertEqual(effective_premium_until(self.user), end)
        self.assertEqual(effective_premium_until(self.user, "organizer"), end)

    def test_concurrent_separate_orders_extend_both_packages_without_lost_renewals(self):
        order_ids = [self.order_id() for _ in range(4)]
        self.assertEqual(sum(self.apply_concurrently(order_ids)), 4)
        end = self.paid_at
        for _ in range(4):
            end = add_premium_period(end, "yearly")
        self.assertEqual(effective_premium_until(self.user), end)
        self.assertEqual(effective_premium_until(self.user, "organizer"), end)


if __name__ == "__main__":
    unittest.main()
