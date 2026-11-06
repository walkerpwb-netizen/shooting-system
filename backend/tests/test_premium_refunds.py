import json
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from models import AutopayReceipt, Competition, PremiumOrder, PremiumRefund, User
from premium_access import apply_paid_premium_order, effective_premium_until, has_paid_publication, premium_display_fields
from premium_contract import queued_access_until
from premium_deadlines import withdrawal_deadline
from premium_refunds import refresh_pending_refunds, refresh_refund, request_refund
from autopay_protocol import payment_hash
from payment_transactions import transaction_overview
import test_payment_reports as reports

CONFIG = {"service": "12345", "key": "synthetic-refund-key", "algorithm": "sha256",
          "environment": "production", "gateway": "https://pay.autopay.eu/payment"}


class PremiumRefundTests(unittest.TestCase):
    setUpBase = reports.PaymentReportsTests.setUp
    tearDown = reports.PaymentReportsTests.tearDown
    make_engine = reports.PaymentReportsTests.make_engine
    order = reports.PaymentReportsTests.order
    receipt = reports.PaymentReportsTests.receipt
    transaction = reports.PaymentReportsTests.transaction
    request = reports.PaymentReportsTests.request

    def setUp(self):
        self.setUpBase()
        self.now = datetime(2026, 11, 6, 18, tzinfo=timezone.utc)
        clock = patch('premium_refunds.datetime', wraps=datetime)
        self.clock = clock.start(); self.clock.now.return_value = self.now
        self.addCleanup(clock.stop)
        config = patch('premium_payments.notification_config', return_value=CONFIG)
        config.start(); self.addCleanup(config.stop)

    def paid(self, package='shooter', period='monthly'):
        receipt = self.receipt()
        order = self.db.get(PremiumOrder, receipt.order_id)
        order.package, order.period = package, period
        order.status, order.paid_at = 'paid', self.now.isoformat()
        self.db.commit()
        return order

    def accepted(self, config, path, fields, **kwargs):
        self.assertEqual(path, '/settlementapi/transactionRefund')
        return (f'<transactionRefund><serviceID>{config["service"]}</serviceID><messageID>{fields["MessageID"]}</messageID>'
                f'<hash>{payment_hash([config["service"], fields["MessageID"]],config)}</hash></transactionRefund>').encode()

    def result(self, status, *, forged=False):
        def reply(config, path, fields, **kwargs):
            self.assertEqual(path, '/settlementapi/outDetails/v2')
            result = {'serviceId': int(config['service']), 'messageId': fields['messageId'], 'status': status, 'remoteOutId': 'refund123'}
            result['hash'] = '0' * 64 if forged else payment_hash(result.values(), config)
            return json.dumps(result).encode()
        return reply

    def test_immediate_revocation_is_committed_before_network_and_preserves_free_access(self):
        order = self.paid()
        self.user.premium_until = '2026-12-31T23:59:59+01:00'
        self.db.commit()
        self.assertTrue(apply_paid_premium_order(order, self.db)); self.db.commit()
        def accepted(*args, **kwargs):
            self.db.expire_all()
            self.assertIsNotNone(order.refund_requested_at)
            self.assertIsNone(order.refunded_at)
            self.assertIsNone(self.user.premium_shooter_paid_until)
            self.assertEqual(effective_premium_until(self.user).year, 2026)
            self.assertFalse(apply_paid_premium_order(order, self.db))
            return self.accepted(*args, **kwargs)
        with patch('premium_refunds.post_xml', side_effect=accepted):
            request_refund(order, self.db, CONFIG, admin_id=self.user.id)
        self.assertEqual(order.refund_requested_by, self.user.id)
        self.assertIsNone(order.refunded_at)
        self.assertEqual(self.db.query(AutopayReceipt).count(), 1)
        row = transaction_overview(self.db)['entries'][0]
        self.assertEqual(row['status'], 'refund_pending')
        self.assertEqual(row['status_label'], 'W trakcie zwrotu')
        self.assertFalse(row['can_request_refund'])

    def test_future_renewal_disappears_and_cannot_activate_even_after_its_start(self):
        order = self.paid()
        self.user.premium_until = '2026-12-31T23:59:59+01:00'
        order.service_starts_at = '2026-12-31T23:59:59+01:00'
        order.service_ends_at = '2027-01-31T23:59:59+01:00'
        self.db.commit()
        self.assertIn('2027-01-31', premium_display_fields(self.user)['premium_coverage_until'])
        with patch('premium_refunds.post_xml', side_effect=self.accepted):
            request_refund(order, self.db, CONFIG)
        self.assertIn('2026-12-31', premium_display_fields(self.user)['premium_coverage_until'])
        self.assertIsNone(queued_access_until(self.user, 'shooter', self.db))
        with patch('premium_access.datetime', wraps=datetime) as clock:
            clock.now.return_value = datetime(2027, 1, 1, tzinfo=timezone.utc)
            self.assertFalse(apply_paid_premium_order(order, self.db))
        self.assertIsNone(self.user.premium_shooter_paid_until)

    def test_network_failure_keeps_withdrawal_and_retry_after_deadline_uses_same_id(self):
        order = self.paid()
        self.assertTrue(apply_paid_premium_order(order, self.db)); self.db.commit()
        ids = []
        def timeout(config, path, fields, **kwargs):
            ids.append(fields['MessageID']); raise HTTPException(502, 'secret-not-for-user')
        with patch('premium_refunds.post_xml', side_effect=timeout):
            for _ in range(2):
                with self.assertRaises(HTTPException): request_refund(order, self.db, CONFIG)
        self.assertEqual(ids[0], ids[1])
        self.assertIsNone(self.user.premium_shooter_paid_until)
        self.assertIsNone(order.refunded_at)
        self.assertNotIn('secret', self.db.query(PremiumRefund).one().error)
        self.clock.now.return_value = self.now + timedelta(days=40)
        with patch('premium_refunds.post_xml', side_effect=self.accepted):
            request_refund(order, self.db, CONFIG)
        self.assertEqual(self.db.query(PremiumRefund).one().id, ids[0])
        self.assertEqual(self.db.query(PremiumRefund).one().status, 'accepted')

    def test_only_signed_done_finishes_refund_and_invalid_status_keeps_withdrawal(self):
        order = self.paid()
        with patch('premium_refunds.post_xml', side_effect=self.accepted): request_refund(order, self.db, CONFIG)
        for status, forged in [('DONE', True), ('ALIEN', False), ('PROCESSING', False), ('DONE', False)]:
            self.clock.now.return_value += timedelta(seconds=16)
            with patch('premium_refunds.post_xml', side_effect=self.result(status, forged=forged)):
                if forged or status == 'ALIEN':
                    with self.assertRaises(HTTPException): refresh_refund(order, self.db, CONFIG)
                else: refresh_refund(order, self.db, CONFIG)
            self.assertEqual(bool(order.refunded_at), status == 'DONE' and not forged)
            self.assertFalse(apply_paid_premium_order(order, self.db))
        self.assertEqual(transaction_overview(self.db)['entries'][0]['status_label'], 'Zwrot zrealizowany')
        with patch('premium_refunds.post_xml') as network:
            refresh_refund(order, self.db, CONFIG)
            with self.assertRaises(HTTPException): request_refund(order, self.db, CONFIG)
            network.assert_not_called()
        self.assertEqual(self.db.query(AutopayReceipt).count(), 1)

    def test_failed_provider_refund_does_not_restore_access_and_retry_gets_new_id(self):
        order = self.paid()
        apply_paid_premium_order(order, self.db); self.db.commit()
        with patch('premium_refunds.post_xml', side_effect=self.accepted): request_refund(order, self.db, CONFIG)
        original = self.db.query(PremiumRefund).one().id
        with patch('premium_refunds.post_xml', side_effect=self.result('CANCELED_NO_FUNDS_ON_BALANCE')): refresh_refund(order, self.db, CONFIG)
        self.assertIsNone(self.user.premium_shooter_paid_until)
        row = transaction_overview(self.db)['entries'][0]
        self.assertEqual(row['status'], 'refund_pending'); self.assertTrue(row['refunds'][0]['error'])
        self.clock.now.return_value += timedelta(days=30)
        with patch('premium_refunds.post_xml', side_effect=self.accepted): request_refund(order, self.db, CONFIG)
        self.assertEqual(self.db.query(PremiumRefund).count(), 2)
        self.assertNotEqual(self.db.query(PremiumRefund).filter_by(status='accepted').one().id, original)

    def test_organizer_bonus_withdrawn_and_other_shooter_purchase_preserved(self):
        independent = self.paid()
        apply_paid_premium_order(independent, self.db); self.db.commit()
        original = self.user.premium_shooter_paid_until
        organizer = self.order(package='organizer', period='yearly')
        organizer.status, organizer.paid_at = 'paid', self.now.isoformat()
        from payment_reports import record_autopay_receipt
        record_autopay_receipt(organizer, self.transaction(organizer, remote='second'), self.db)
        self.db.commit()
        apply_paid_premium_order(organizer, self.db); self.db.commit()
        self.assertTrue(self.user.premium_organizer_paid_until)
        with patch('premium_refunds.post_xml', side_effect=self.accepted): request_refund(organizer, self.db, CONFIG)
        self.assertIsNone(self.user.premium_organizer_paid_until)
        self.assertEqual(self.user.premium_shooter_paid_until, original)
        self.assertEqual(effective_premium_until(self.user).isoformat(), original)

    def test_publication_withdrawal_does_not_remove_timed_premium(self):
        order = self.paid('organizer', 'monthly')
        event = Competition(name='Test', date='2026-12-01', location='Test', created_by=self.user.email, status='draft')
        self.db.add(event); self.db.commit()
        order.competition_id = event.id
        self.user.premium_organizer_paid_until = '2027-05-01T00:00:00+02:00'
        self.db.commit()
        apply_paid_premium_order(order, self.db); self.db.commit()
        self.assertTrue(has_paid_publication(self.user, event, self.db))
        with patch('premium_refunds.post_xml', side_effect=self.accepted): request_refund(order, self.db, CONFIG)
        self.assertFalse(has_paid_publication(self.user, event, self.db))
        self.assertEqual(self.user.premium_organizer_paid_until, '2027-05-01T00:00:00+02:00')

    def test_all_receipts_of_a_double_paid_order_are_refunded_once(self):
        order = self.paid()
        from payment_reports import record_autopay_receipt
        record_autopay_receipt(order, self.transaction(order, remote='second'), self.db); self.db.commit()
        with patch('premium_refunds.post_xml', side_effect=self.accepted) as send:
            request_refund(order, self.db, CONFIG)
            self.assertEqual(send.call_count, 2)
        refunds = self.db.query(PremiumRefund).all()
        for index, refund in enumerate(refunds):
            with patch('premium_refunds.post_xml', side_effect=self.result('DONE')): refresh_refund(order, self.db, CONFIG, refund_id=refund.id)
            self.assertEqual(bool(order.refunded_at), index == 1)
        self.assertEqual(self.db.query(AutopayReceipt).count(), 2)
        self.assertEqual(sum(r.amount_grosz for r in refunds), 2000)

    def test_admin_can_refund_another_users_order_and_unauthorized_routes_never_send(self):
        order = self.paid()
        other = User(email='other@example.test', is_active=1)
        self.db.add(other); self.db.commit(); order.user_id = other.id; self.db.commit()
        for action in ('refund', 'refund-check'):
            path = f'/admin/payments/transactions/{order.id}/{action}'
            with patch('premium_refunds.post_xml') as send:
                self.assertEqual(self.request(path, method='POST')[0], 401)
                self.assertEqual(self.request(path, 'organizer', method='POST')[0], 403)
                send.assert_not_called()
        with patch('premium_refunds.post_xml', side_effect=self.accepted):
            code, headers, body = self.request(f'/admin/payments/transactions/{order.id}/refund', 'admin', method='POST')
        self.assertEqual(code, 202); self.assertEqual(headers[b'cache-control'], b'no-store')
        self.assertFalse(json.loads(body)['warning'])
        self.assertEqual(order.refund_requested_by, self.user.id)

    def test_expired_unpaid_missing_receipt_and_wrong_config_do_not_withdraw_or_send(self):
        order = self.paid()
        with patch('premium_refunds.post_xml') as send:
            self.clock.now.return_value += timedelta(days=40)
            with self.assertRaises(HTTPException): request_refund(order, self.db, CONFIG)
            self.clock.now.return_value = self.now
            order.status = 'pending'; self.db.commit()
            with self.assertRaises(HTTPException): request_refund(order, self.db, CONFIG)
            order.status = 'paid'; self.db.query(AutopayReceipt).delete(); self.db.commit()
            with self.assertRaises(HTTPException): request_refund(order, self.db, CONFIG)
            with self.assertRaises(HTTPException): request_refund(order, self.db, {**CONFIG, 'service':'999'})
            send.assert_not_called()
        self.assertIsNone(order.refund_requested_at)
        self.assertEqual(self.db.query(PremiumRefund).count(), 0)

    def test_worker_confirms_existing_refund_without_new_request_and_rate_limits_checks(self):
        order = self.paid()
        with patch('premium_refunds.post_xml', side_effect=self.accepted): request_refund(order, self.db, CONFIG)
        with patch('database.SessionLocal', sessionmaker(bind=self.engine, autoflush=False)), patch('premium_refunds.post_xml', side_effect=self.result('DONE')) as network:
            refresh_pending_refunds(); refresh_pending_refunds()
            self.assertEqual(network.call_count, 1)
        self.db.expire_all(); self.assertTrue(order.refunded_at)

    def test_timeout_route_reports_saved_withdrawal_as_warning_not_successful_settlement(self):
        order = self.paid()
        with patch('premium_refunds.post_xml', side_effect=HTTPException(502, 'network')):
            code, _, body = self.request(f'/admin/payments/transactions/{order.id}/refund', 'admin', method='POST')
        self.assertEqual(code, 202); self.assertTrue(json.loads(body)['warning'])
        self.assertTrue(order.refund_requested_at); self.assertIsNone(order.refunded_at)

    def test_pending_checks_are_rate_limited_and_expired_admin_action_is_rejected(self):
        order = self.paid()
        self.clock.now.return_value += timedelta(days=40)
        with patch('premium_refunds.post_xml') as network:
            code, _, _ = self.request(f'/admin/payments/transactions/{order.id}/refund', 'admin', method='POST')
            self.assertEqual(code, 409); network.assert_not_called()
        self.clock.now.return_value = self.now
        with patch('premium_refunds.post_xml', side_effect=self.accepted): request_refund(order, self.db, CONFIG)
        with patch('premium_refunds.post_xml', side_effect=self.result('PROCESSING')) as network:
            refresh_refund(order, self.db, CONFIG); refresh_refund(order, self.db, CONFIG)
            self.assertEqual(network.call_count, 1)
            self.assertIsNone(order.refunded_at)


class WithdrawalDeadlineTests(unittest.TestCase):
    def deadline(self, paid):
        return withdrawal_deadline(SimpleNamespace(paid_at=paid)).isoformat()

    def test_whole_last_day_and_weekend_holiday_dst_and_missing_timestamp(self):
        self.assertEqual(self.deadline('2026-11-06T16:05:31+01:00'), '2026-11-21T00:00:00+01:00')
        # Saturday becomes Monday, even with a DST change in the interval.
        self.assertEqual(self.deadline('2026-03-21T12:00:00+01:00'), '2026-04-08T00:00:00+02:00')
        # Christmas Eve, Christmas and the weekend: last day is Monday Dec 28.
        self.assertEqual(self.deadline('2026-12-10T12:00:00+01:00'), '2026-12-29T00:00:00+01:00')
        self.assertIsNone(withdrawal_deadline(SimpleNamespace(paid_at=None)))
