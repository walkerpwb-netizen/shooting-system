import base64
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from xml.etree.ElementTree import fromstring, tostring

from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from autopay_api import cancel_unpaid_order, post_xml, refresh_order, test_connection
from autopay_protocol import parse_payment_date
from models import AutopayReceipt, Competition, PremiumMailOutbox, PremiumNotification, PremiumOrder, PremiumRefund
from payment_limits import payment_limit_state
from premium_access import apply_paid_premium_order, has_paid_publication
from premium_contract import TERMS_VERSION, contract_snapshot, make_quote, terms_sections
from premium_mail import deliver_pending_confirmations, queue_confirmation
from premium_payments import CheckoutData, create_sandbox_order, payment_hash, process_itn, sandbox_config, seller_details
from premium_refunds import refresh_refund, request_refund
from test_premium_payments import PremiumPaymentTests


class AutopayCompletionTests(unittest.TestCase):
    setUp = PremiumPaymentTests.setUp
    tearDown = PremiumPaymentTests.tearDown
    checkout = PremiumPaymentTests.checkout
    notification = PremiumPaymentTests.notification
    request = PremiumPaymentTests.request

    def quoted(self, **updates):
        data = self.data.model_copy(update=updates)
        q = make_quote(self.admin, data.package, data.period, data.expected_price,
                       data.early_start_requested, data.competition_id, seller_details())
        return data.model_copy(update={"quote_token": q["quote_token"]}), q

    def pay(self, order_id):
        process_itn(self.notification(order_id), self.db, sandbox_config())
        return self.db.get(PremiumOrder, order_id)

    def production_config(self):
        return {**sandbox_config(), "environment": "production", "gateway": "https://pay.autopay.eu/payment"}

    def test_quote_cannot_be_tampered_reused_by_another_user_or_used_after_expiry(self):
        data, q = self.quoted(early_start_requested=True)
        payload, signature = data.quote_token.split('.')
        body = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        body['amount'] = '0.01'
        tampered = base64.urlsafe_b64encode(json.dumps(body).encode()).rstrip(b'=').decode() + '.' + signature
        with self.assertRaises(HTTPException):
            self.checkout(data.model_copy(update={"quote_token": tampered}))
        other_user = self.admin.id + 100
        self.admin.id = other_user
        try:
            with self.assertRaises(HTTPException):
                self.checkout(data)
        finally:
            self.admin.id = other_user - 100
        with patch('premium_contract.now', return_value=datetime.fromisoformat(q['expires_at']) + timedelta(seconds=1)):
            with self.assertRaises(HTTPException):
                self.checkout(data)
        self.assertEqual(self.db.query(PremiumOrder).count(), 0)

    def test_one_quote_creates_one_order_and_gateway_fields_have_short_validity(self):
        data, q = self.quoted()
        first = self.checkout(data)
        again = self.checkout(data)
        self.assertEqual(first['order_id'], again['order_id'])
        self.assertEqual(self.db.query(PremiumOrder).count(), 1)
        self.assertEqual(first['fields']['ValidityTime'], first['fields']['LinkValidityTime'])
        self.assertEqual(first['fields']['Hash'], payment_hash([v for k, v in first['fields'].items() if k != 'Hash'], sandbox_config()))
        order = self.db.get(PremiumOrder, first['order_id'])
        self.assertGreaterEqual(datetime.fromisoformat(order.service_starts_at), datetime.fromisoformat(q['issued_at']) + timedelta(days=14))
        self.assertEqual(json.loads(order.contract_snapshot)['terms_version'], TERMS_VERSION)
        self.assertEqual(json.loads(order.contract_snapshot)['terms'], terms_sections())

    def test_single_publication_requires_own_draft_and_sandbox_never_grants_it(self):
        data = self.data.model_copy(update={'package': 'organizer', 'period': 'monthly'})
        with self.assertRaises(HTTPException):
            create_sandbox_order(data, self.admin, self.db, lambda db: self.prices, lambda user: True)
        foreign = Competition(name='Foreign', date='2026-11-30', location='Test', created_by='other@example.test', status='draft')
        self.db.add(foreign); self.db.commit()
        with self.assertRaises(HTTPException):
            self.checkout(data.model_copy(update={'competition_id': foreign.id}))
        own = self.checkout(data.model_copy(update={'competition_id': self.event.id}))
        order = self.pay(own['order_id'])
        self.assertEqual(order.competition_id, self.event.id)
        self.assertIsNone(order.publication_granted_at)
        self.assertFalse(has_paid_publication(self.admin, self.event, self.db))
        preview = json.loads(order.fulfillment_preview)
        self.assertEqual(preview['competition_id'], self.event.id)
        self.assertFalse(preview['real_access_granted'])

    def test_early_start_choice_is_explicit_and_preserved_in_contract(self):
        self.admin.premium_until = None
        self.db.commit()
        late, late_q = self.quoted()
        early, early_q = self.quoted(early_start_requested=True)
        self.assertFalse(late_q['early_start_requested'])
        self.assertTrue(early_q['early_start_requested'])
        self.assertGreater(datetime.fromisoformat(late_q['service_starts_at']), datetime.fromisoformat(early_q['service_starts_at']) + timedelta(days=13))
        order = self.db.get(PremiumOrder, self.checkout(early)['order_id'])
        snapshot = json.loads(order.contract_snapshot)
        self.assertIn('Żądam rozpoczęcia', snapshot['early_start_text'])
        old_price = snapshot['amount']
        self.prices['shooter']['monthly_price'] = '99.99'
        self.assertEqual(json.loads(order.contract_snapshot)['amount'], old_price)

    def test_signed_return_is_required_when_return_parameters_are_present_and_never_marks_paid(self):
        order_id = self.checkout()['order_id']
        config = sandbox_config()
        data = {'service_id': config['service'], 'hash': payment_hash([config['service'], order_id], config)}
        code, body = self.request('POST', f'/premium/orders/{order_id}/verify-return', json.dumps(data).encode(), authorized=True)
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(body)['verified'])
        data['hash'] = '0' * 64
        code, _ = self.request('POST', f'/premium/orders/{order_id}/verify-return', json.dumps(data).encode(), authorized=True)
        self.assertEqual(code, 400)
        self.assertEqual(self.db.get(PremiumOrder, order_id).status, 'pending')
        self.assertEqual(self.db.query(AutopayReceipt).count(), 0)

    def test_invalid_itn_returns_signed_negative_xml_http_200_without_writes(self):
        order_id = self.checkout()['order_id']
        xml = self.notification(order_id).replace(b'SUCCESS', b'FAILURE')
        from urllib.parse import urlencode
        encoded = urlencode({'transactions': base64.b64encode(xml).decode()}).encode()
        code, body = self.request('POST', '/premium/autopay/sandbox/itn', encoded, 'application/x-www-form-urlencoded')
        self.assertEqual(code, 200)
        reply = fromstring(body)
        self.assertEqual(reply.findtext('.//confirmation'), 'NOTCONFIRMED')
        self.assertEqual(reply.findtext('hash'), payment_hash(['12345', order_id, 'NOTCONFIRMED'], sandbox_config()))
        self.assertEqual(self.db.query(PremiumNotification).count(), 0)
        self.assertEqual(self.db.query(AutopayReceipt).count(), 0)

    def test_itn_is_single_but_signed_status_api_can_have_two_transactions(self):
        order_id = self.checkout()['order_id']
        root = fromstring(self.notification(order_id))
        second = fromstring(tostring(root.find('.//transaction')))
        second.find('remoteID').text = 'remote456'
        root.find('transactions').append(second)
        values = ['12345'] + [node.text for tx in root.find('transactions') for node in tx]
        root.find('hash').text = payment_hash(values, sandbox_config())
        xml = tostring(root)
        with self.assertRaises(HTTPException):
            process_itn(xml, self.db, sandbox_config())
        process_itn(xml, self.db, sandbox_config(), allow_batch=True)
        process_itn(xml, self.db, sandbox_config(), allow_batch=True)
        self.assertEqual(self.db.query(AutopayReceipt).count(), 2)
        self.assertEqual(self.db.query(PremiumNotification).count(), 2)
        self.assertEqual([r.deliveries for r in self.db.query(PremiumNotification).all()], [2, 2])

    def test_cet_date_is_converted_to_polish_quarter_without_losing_raw_timestamp(self):
        self.assertEqual(parse_payment_date('20260331233000', 'CET').date().isoformat(), '2026-04-01')
        self.assertEqual(parse_payment_date('20260331233000', 'Europe/Warsaw').date().isoformat(), '2026-03-31')
        order = self.db.get(PremiumOrder, self.checkout()['order_id'])
        xml = self.notification(order.id).replace(b'20261025200000', b'20260331233000')
        root = fromstring(xml)
        root.find('hash').text = payment_hash(['12345'] + [n.text for n in root.find('.//transaction')], sandbox_config())
        process_itn(tostring(root), self.db, sandbox_config())
        receipt = self.db.query(AutopayReceipt).one()
        self.assertEqual(receipt.paid_on.isoformat(), '2026-04-01')
        self.assertEqual(receipt.provider_payment_date, '20260331233000')

    def test_status_query_requires_verified_signature_and_preserves_order_on_forgery(self):
        order = self.db.get(PremiumOrder, self.checkout()['order_id'])
        with patch('autopay_api.post_xml', return_value=self.notification(order.id).replace(b'SUCCESS', b'FAILURE')):
            with self.assertRaises(HTTPException):
                refresh_order(order, self.db, sandbox_config())
        self.assertEqual(order.status, 'pending')
        order.last_status_check_at = None; self.db.commit()
        with patch('autopay_api.post_xml', return_value=self.notification(order.id)):
            refresh_order(order, self.db, sandbox_config())
        self.assertEqual(order.status, 'paid')
        with self.assertRaises(HTTPException) as error:
            refresh_order(order, self.db, sandbox_config())
        self.assertEqual(error.exception.status_code, 429)

    def test_verified_cancellation_releases_reservation_only_after_operator_confirms_all(self):
        order = self.db.get(PremiumOrder, self.checkout()['order_id'])
        order.environment = 'production'; self.db.commit()
        now = datetime(2026, 10, 26, tzinfo=timezone.utc)
        self.assertEqual(payment_limit_state(self.db, now)['reserved'], '12.34')
        config = self.production_config()
        def reply(config, path, fields):
            values = [config['service'], fields['MessageID'], 'CONFIRMED', 'CANCELED_FULLY']
            return (f'<transaction><serviceID>{values[0]}</serviceID><messageID>{values[1]}</messageID>'
                    f'<confirmation>{values[2]}</confirmation><reason>{values[3]}</reason><hash>{payment_hash(values,config)}</hash></transaction>').encode()
        with patch('autopay_api.post_xml', side_effect=reply):
            cancel_unpaid_order(order, self.db, config)
        self.assertTrue(order.provider_closed_at)
        self.assertEqual(order.status, 'cancelled')
        self.assertEqual(payment_limit_state(self.db, now)['reserved'], '0.00')

    def test_forged_cancellation_or_network_failure_never_releases_budget_and_keeps_message_id(self):
        order = self.db.get(PremiumOrder, self.checkout()['order_id'])
        order.environment = 'production'; self.db.commit()
        config = self.production_config()
        ids = []
        def failed(config, path, fields):
            ids.append(fields['MessageID'])
            raise HTTPException(502, 'network')
        for _ in range(2):
            with patch('autopay_api.post_xml', side_effect=failed), self.assertRaises(HTTPException):
                cancel_unpaid_order(order, self.db, config)
        self.assertEqual(ids[0], ids[1])
        self.assertIsNone(order.provider_closed_at)
        self.assertEqual(payment_limit_state(self.db, datetime(2026,10,26,tzinfo=timezone.utc))['reserved'], '12.34')

    def test_mail_outbox_is_idempotent_and_delivery_failure_can_be_retried_without_real_email(self):
        data, _ = self.quoted(test_email_requested=True)
        with patch('mailer.is_mail_configured', return_value=False):
            with self.assertRaises(HTTPException) as error:
                self.checkout(data)
            self.assertEqual(error.exception.status_code, 400)
            self.assertEqual(self.db.query(PremiumOrder).count(), 0)
        with patch('mailer.is_mail_configured', return_value=True):
            order = self.pay(self.checkout(data)['order_id'])
        process_itn(self.notification(order.id), self.db, sandbox_config())
        self.assertEqual(self.db.query(PremiumMailOutbox).count(), 1)
        factory = sessionmaker(bind=self.engine)
        with patch('database.SessionLocal', factory), patch('mailer.send_email', side_effect=RuntimeError('secret-must-not-leak')):
            deliver_pending_confirmations(order.id)
        self.db.expire_all()
        entry = self.db.query(PremiumMailOutbox).one()
        self.assertIsNone(entry.sent_at)
        self.assertNotIn('secret', entry.error)
        self.assertIn('TEST SANDBOX', entry.body)
        self.assertIn(terms_sections()[0]['paragraphs'][0], entry.body)
        with patch('database.SessionLocal', factory), patch('mailer.send_email') as send:
            deliver_pending_confirmations(order.id)
            deliver_pending_confirmations(order.id)
            self.assertEqual(send.call_count, 1)
            self.assertFalse(send.call_args.kwargs['copy_to_admin'])
        self.db.expire_all()
        self.assertTrue(self.db.query(PremiumMailOutbox).one().sent_at)
        self.assertIsNone(self.admin.premium_shooter_paid_until)

    def test_production_fulfillment_waits_for_email_and_scheduled_start_then_grants_only_target_event(self):
        self.admin.premium_until = None; self.db.commit()
        data, _ = self.quoted(package='organizer', period='monthly', competition_id=self.event.id, early_start_requested=True)
        order = self.db.get(PremiumOrder, self.checkout(data)['order_id'])
        order.environment = 'production'; order.status = 'paid'; order.paid_at = datetime.now(timezone.utc).isoformat()
        order.service_starts_at = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.db.commit()
        self.assertFalse(apply_paid_premium_order(order, self.db))
        queue_confirmation(order, self.db); self.db.commit()
        entry = self.db.query(PremiumMailOutbox).one(); entry.sent_at = datetime.now(timezone.utc).isoformat(); self.db.commit()
        self.assertTrue(apply_paid_premium_order(order, self.db)); self.db.commit()
        self.assertTrue(has_paid_publication(self.admin, self.event, self.db))
        self.assertIsNone(self.admin.premium_organizer_paid_until)
        self.assertIsNone(self.admin.premium_shooter_paid_until)
        self.assertFalse(apply_paid_premium_order(order, self.db))

    def test_scheduled_production_package_does_not_start_before_requested_date(self):
        self.admin.premium_until = None; self.db.commit()
        data, _ = self.quoted(early_start_requested=False)
        order = self.db.get(PremiumOrder, self.checkout(data)['order_id'])
        order.environment = 'production'; order.status = 'paid'; order.paid_at = datetime.now(timezone.utc).isoformat()
        queue_confirmation(order, self.db); self.db.commit()
        mail = self.db.query(PremiumMailOutbox).one(); mail.sent_at = datetime.now(timezone.utc).isoformat(); self.db.commit()
        self.assertFalse(apply_paid_premium_order(order, self.db))
        self.assertIsNone(self.admin.premium_shooter_paid_until)
        after = datetime.fromisoformat(order.service_starts_at) + timedelta(seconds=1)
        with patch('premium_access.datetime', wraps=datetime) as clock:
            clock.now.return_value = after
            self.assertTrue(apply_paid_premium_order(order, self.db))
        self.db.commit()
        self.assertTrue(self.admin.premium_shooter_paid_until)

    def test_refund_request_is_not_completion_and_retry_uses_same_message_id(self):
        order = self.pay(self.checkout()['order_id'])
        ids = []
        def accepted(config, path, fields, **kwargs):
            ids.append(fields['MessageID'])
            return (f'<transactionRefund><serviceID>{config["service"]}</serviceID><messageID>{fields["MessageID"]}</messageID>'
                    f'<hash>{payment_hash([config["service"],fields["MessageID"]],config)}</hash></transactionRefund>').encode()
        with patch('premium_refunds.post_xml', side_effect=accepted):
            request_refund(order, self.db, sandbox_config())
            request_refund(order, self.db, sandbox_config())
        self.assertEqual(ids[0], ids[1])
        self.assertEqual(self.db.query(PremiumRefund).one().status, 'accepted')
        self.assertIsNone(order.refunded_at)
        refund = self.db.query(PremiumRefund).one()
        def done(config, path, fields, **kwargs):
            result = {'serviceId':int(config['service']),'messageId':refund.id,'status':'DONE','remoteOutId':'out123'}
            result['hash'] = payment_hash(result.values(),config)
            return json.dumps(result).encode()
        with patch('premium_refunds.post_xml', side_effect=done):
            refresh_refund(order, self.db, sandbox_config())
        self.assertEqual(self.db.query(PremiumRefund).one().status, 'done')
        self.assertTrue(order.refunded_at)
        self.assertEqual(self.db.query(AutopayReceipt).count(), 1)
        self.assertEqual(self.admin.premium_until, '2026-12-31T23:59:59+01:00')

    def test_connection_test_does_not_start_payment_and_checks_response_identity(self):
        def gateway(config, path, fields, **kwargs):
            self.assertEqual(path, '/gatewayList/v3')
            self.assertTrue(kwargs['json_body'])
            result = {'result':'OK','serviceID':str(fields['ServiceID']),'messageID':fields['MessageID'],
                      'gatewayList':[{'state':'OK'},{'state':'TEMPORARY_DISABLED'}]}
            return json.dumps(result).encode()
        with patch('autopay_api.post_xml', side_effect=gateway):
            self.assertEqual(test_connection(sandbox_config())['available_channels'], 1)
        with patch('autopay_api.post_xml', return_value=b'{"result":"ERROR","errorStatus":"SERVICE_NOT_FOUND"}'):
            with self.assertRaises(HTTPException) as error:
                test_connection(sandbox_config())
            self.assertIn('SERVICE_NOT_FOUND', error.exception.detail)
        self.assertEqual(self.db.query(PremiumOrder).count(), 0)

    def test_network_transport_has_fixed_host_timeout_header_and_never_sends_plain_key(self):
        config = sandbox_config()
        with patch('autopay_api.build_opener') as build:
            build.return_value.open.return_value.__enter__.return_value.read.return_value = b'<ok/>'
            result = post_xml(config, '/webapi/transactionStatus', {'ServiceID':config['service'],'Hash':'test-hash'})
            self.assertEqual(result, b'<ok/>')
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, 'https://testpay.autopay.eu/webapi/transactionStatus')
            self.assertEqual(request.get_header('Bmheader'), 'pay-bm')
            self.assertNotIn(config['key'].encode(),request.data)
            self.assertEqual(build.return_value.open.call_args.kwargs['timeout'],10)
        with self.assertRaises(HTTPException):
            post_xml({**config,'gateway':'https://pay.autopay.eu/payment'}, '/webapi/transactionStatus', {})

    def test_production_callbacks_remain_unavailable_before_release(self):
        from urllib.parse import urlencode
        form = urlencode({'transactions':base64.b64encode(b'<anything/>').decode()}).encode()
        code, _ = self.request('POST','/premium/autopay/production/itn',form,'application/x-www-form-urlencoded')
        self.assertEqual(code,503)
        self.assertFalse(json.loads(self.request('GET','/premium/commerce')[1])['sales_enabled'])


del PremiumPaymentTests

if __name__ == '__main__':
    unittest.main()
