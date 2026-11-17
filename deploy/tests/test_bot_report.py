"""Verify spoof handling, feed failures, report privacy, compressed logs and retention."""
from datetime import datetime, timedelta, timezone
import gzip
import importlib.util
import ipaddress
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

SPEC = importlib.util.spec_from_file_location('bot_report', Path(__file__).parents[1] / 'scripts/report-bots.py')
report = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(report)
UTC = timezone.utc


class BotReportTests(unittest.TestCase):
    def test_bot_specific_ranges_ipv6_spoof_and_unavailable_source(self):
        nets = {'google': [ipaddress.ip_network('2001:db8::/32')],
                'gptbot': [ipaddress.ip_network('192.0.2.0/24')], 'anthropic': None}
        self.assertEqual(report.verify(ipaddress.ip_address('2001:db8::1'), 'google', nets)[0], 'verified')
        self.assertEqual(report.verify(ipaddress.ip_address('192.0.2.1'), 'google', nets)[0], 'declared')
        self.assertEqual(report.verify(ipaddress.ip_address('192.0.2.1'), 'anthropic', nets)[0], 'unresolved')
        self.assertEqual(report.verify(ipaddress.ip_address('192.0.2.1'), 'gptbot', nets, test=True), ('declared', 'test_request'))

    def test_ua_tokens_roles_and_conflicting_claims(self):
        self.assertEqual(report.identify('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')[0], 'Googlebot')
        self.assertEqual(report.identify('ChatGPT-User/1.0')[1], 'user_fetch')
        self.assertEqual(report.identify('ClaudeBot/1.0')[1], 'training')
        for ua in ('FakeGooglebot/2.1', 'https://example.com/Googlebot', 'Googlebot-Evil/1.0'):
            self.assertEqual(report.identify(ua)[0], 'unclassified')
        self.assertEqual(report.identify('GPTBot/1.0 Googlebot/2.1')[0], 'ambiguous')

    def test_feed_failure_and_invalid_cidr_do_not_verify(self):
        with patch.object(report, 'urlopen', side_effect=HTTPError('https://example.com', 403, '', {}, None)):
            _, nets, meta = report.fetch_source(('test', 'https://example.com'))
        self.assertIsNone(nets)
        self.assertEqual(meta['reason'], 'http_403')
        for raw in (b'{"prefixes":[]}', b'{"prefixes":[{"ipv4Prefix":"bogus"}]}', b'{"wrong":[]}'):
            with patch.object(report, 'urlopen') as request:
                request.return_value.__enter__.return_value.read.return_value = raw
                self.assertIsNone(report.fetch_source(('test', 'https://example.com'))[1])

    def test_aggregation_never_emits_ips_paths_uas_or_queries(self):
        start = datetime(2026, 11, 17, tzinfo=UTC)
        row = {'schema': 1, 'time': start.isoformat(), 'ip': '192.0.2.3',
               'host': 'system-strzelecki.pl', 'scheme': 'https', 'ua': 'Googlebot/2.1',
               'path': '/competitions/123?token=SECRET', 'status': 503,
               'maintenance_blocked': '1', 'xff': '2001:db8::1'}
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'bots.log.gz'
            with gzip.open(path, 'wt') as stream:
                stream.write(json.dumps(row) + '\n')
                stream.write(json.dumps(dict(row, ip='2001:db8::1', ua='Googlebot/2.1 ShootingBotAuditTest/1.0')) + '\n')
                stream.write(json.dumps(dict(row, host='192.0.2.10', path='/SECRET/private')) + '\n')
                stream.write(json.dumps(dict(row, time=(start - timedelta(days=1)).isoformat())) + '\n')
                stream.write('not JSON\n')
            result = report.aggregate([path], start, start + timedelta(days=1),
                                      {'google': [ipaddress.ip_network('2001:db8::/32')]})
        self.assertEqual(result['stats']['requests'], 3)
        self.assertEqual(result['stats']['malformed_lines'], 1)
        self.assertTrue(all(row['verification'] == 'declared' for row in result['rows']))
        self.assertTrue(any(row['test'] for row in result['rows']))
        self.assertTrue(all(row['maintenance_blocked'] for row in result['rows']))
        output = json.dumps(result)
        for value in ('192.0.2.', '2001:db8::', 'SECRET', 'Googlebot/2.1', '?', '/123'):
            self.assertNotIn(value, output)
        self.assertIn('/competitions/:id', output)

    def test_retention_only_removes_own_reports_and_atomic_file_is_private(self):
        now = datetime(2026, 11, 17, tzinfo=UTC)
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            old = directory / ('bots-' + (now - timedelta(days=90)).date().isoformat() + '.json')
            kept = directory / ('bots-' + (now - timedelta(days=89)).date().isoformat() + '.json')
            unrelated = directory / 'other.json'
            for path in (old, kept, unrelated):
                path.write_text('{}')
            result = report.write_report(directory, {'date_utc': '2026-11-17'}, now)
            self.assertFalse(old.exists())
            self.assertTrue(kept.exists())
            self.assertTrue(unrelated.exists())
            self.assertEqual(result.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
