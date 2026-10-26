"""Real purchase flow with synthetic credentials, no network or SMTP."""
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from xml.etree.ElementTree import fromstring, tostring
from fastapi import HTTPException
from models import AutopayReceipt, PremiumMailOutbox, PremiumOrder
from premium_contract import make_quote
from premium_payments import create_production_order, process_itn, seller_details, sandbox_config, payment_hash
from autopay_config import ConfigurationData, read_configuration, save_configuration
from test_premium_payments import PremiumPaymentTests


class PremiumSalesTests(unittest.TestCase):
    setUp = PremiumPaymentTests.setUp
    tearDown = PremiumPaymentTests.tearDown
    request = PremiumPaymentTests.request
    notification = PremiumPaymentTests.notification

    def enable(self):
        self.db.autoflush = False
        self.admin.role, self.admin.roles = 'shooter', 'user,shooter'
        self.db.commit()
        self.config = {**sandbox_config(), 'ready': True, 'environment': 'production', 'gateway': 'https://pay.autopay.eu/payment'}
        ready = patch('premium_payments.production_config', return_value=self.config)
        ready.start(); self.addCleanup(ready.stop)

    def quoted(self, **changes):
        data = self.data.model_copy(update=changes)
        q = make_quote(self.admin, data.package, data.period, data.expected_price, data.early_start_requested,
                       data.competition_id, seller_details(), environment='production', db=self.db)
        return data.model_copy(update={'quote_token': q['quote_token']}), q

    def buy(self, data):
        return create_production_order(data, self.admin, self.db, lambda db: self.prices, lambda user: user.role == 'admin')

    def test_existing_free_access_is_preserved_and_shooter_can_buy_extension_now(self):
        self.enable(); old = self.admin.premium_until
        data, q = self.quoted(early_start_requested=True)
        self.assertTrue(q['renews_existing_access']); self.assertEqual(q['existing_access_until'], old)
        result = self.buy(data)
        self.assertEqual(result['environment'], 'production'); self.assertEqual(result['gateway_url'], 'https://pay.autopay.eu/payment')
        self.assertEqual(self.buy(data)['order_id'], result['order_id']); self.assertEqual(self.db.query(PremiumOrder).count(), 1)
        order = self.db.get(PremiumOrder, result['order_id'])
        self.assertEqual(datetime.fromisoformat(order.service_starts_at), datetime.fromisoformat(old))
        process_itn(self.notification(order.id), self.db, self.config)
        self.db.refresh(self.admin)
        self.assertEqual(self.admin.premium_until, old); self.assertIsNone(self.admin.premium_shooter_paid_until)
        self.assertIsNone(order.entitlements_applied_at)
        self.assertEqual(self.db.query(AutopayReceipt).one().environment, 'production')
        self.assertEqual(self.db.query(PremiumMailOutbox).count(), 1)

    def test_zero_premium_shooter_can_buy_with_current_start_and_explicit_consent(self):
        self.enable(); self.admin.premium_until = None; self.db.commit()
        data, q = self.quoted(early_start_requested=True)
        self.assertFalse(q['renews_existing_access'])
        self.assertLess(abs((datetime.fromisoformat(q['service_starts_at']) - datetime.now(timezone.utc)).total_seconds()), 5)
        for changes in [{'terms_accepted':False},{'quote_token':None}]:
            with self.assertRaises(HTTPException):self.buy(data.model_copy(update=changes))
        result = self.buy(data); order = self.db.get(PremiumOrder, result['order_id'])
        self.assertEqual(order.status, 'pending'); self.assertIsNone(self.admin.premium_shooter_paid_until)

    def test_several_prepaid_extensions_follow_each_other_and_duplicate_itn_does_not_move_dates(self):
        self.enable()
        data, first_quote = self.quoted()
        first = self.buy(data)['order_id']
        process_itn(self.notification(first), self.db, self.config)
        first_end = self.db.get(PremiumOrder,first).service_ends_at
        data, second_quote = self.quoted()
        self.assertEqual(datetime.fromisoformat(second_quote['service_starts_at']), datetime.fromisoformat(first_end))
        second = self.buy(data)['order_id']
        xml=fromstring(self.notification(second))
        xml.find('.//remoteID').text='remote456'
        xml.find('hash').text=payment_hash([self.config['service']]+[node.text for node in xml.find('.//transaction')],self.config)
        process_itn(tostring(xml),self.db,self.config)
        self.assertEqual(self.db.get(PremiumOrder,second).status,'paid')
        # Same signed delivery must never move the first period after the second.
        process_itn(self.notification(first),self.db,self.config)
        self.assertEqual(self.db.get(PremiumOrder,first).service_ends_at, first_end)

    def test_sandbox_quote_cannot_be_used_for_real_payment_and_http_checkout_allows_shooter(self):
        self.enable()
        q = make_quote(self.admin, 'shooter', 'monthly', '12.34', False, None, seller_details())
        with self.assertRaises(HTTPException):self.buy(self.data.model_copy(update={'quote_token': q['quote_token']}))
        data, q = self.quoted()
        status, body = self.request('POST', '/premium/checkout', data.model_dump_json().encode(), authorized=True)
        self.assertEqual(status, 200, body); self.assertEqual(json.loads(body)['environment'], 'production')
        self.assertTrue(json.loads(self.request('GET','/premium/commerce')[1])['sales_enabled'])

    def test_disabled_sales_do_not_discard_existing_production_notifications(self):
        self.enable();data, q = self.quoted();result = self.buy(data)
        production = {**self.config, 'ready': False}
        with patch('premium_payments.production_config', return_value=production):
            with self.assertRaises(HTTPException): self.buy(data)
            process_itn(self.notification(result['order_id']), self.db, production)
        self.assertEqual(self.db.get(PremiumOrder,result['order_id']).status,'paid')

    def test_production_mode_requires_callbacks_and_mail_and_never_claims_operator_approval(self):
        from types import SimpleNamespace
        value=read_configuration()
        payload={'revision':0,'mode':'production','production_callbacks_configured':True,'merchant_model_confirmed':True,
                 **{n:{**value[n], 'shared_key':'synthetic-'+n,'service_id':'12345' if n=='sandbox' else '67890'} for n in ['sandbox','production']}}
        admin=SimpleNamespace(email='admin@example.test')
        with patch('mailer.is_mail_configured', return_value=False):
            with self.assertRaises(HTTPException):save_configuration(ConfigurationData.model_validate(payload),admin)
        with patch('mailer.is_mail_configured', return_value=True):
            with self.assertRaises(HTTPException):save_configuration(ConfigurationData.model_validate({**payload,'production_callbacks_configured':False}),admin)
            result=save_configuration(ConfigurationData.model_validate(payload),admin)
            self.assertTrue(result['sales_enabled']); self.assertEqual(result['verification_status'],'managed_by_operator')
            self.assertNotIn('synthetic-',json.dumps(result))


del PremiumPaymentTests
