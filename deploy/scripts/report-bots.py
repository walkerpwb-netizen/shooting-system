#!/usr/bin/env python3
"""Aggregate nginx JSON logs without publishing client IPs, raw UAs or URL data."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone
import glob
import gzip
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

UTC = timezone.utc
SOURCES = {
    'google': 'https://developers.google.com/static/crawling/ipranges/common-crawlers.json',
    'bing': 'https://www.bing.com/toolbox/bingbot.json',
    'oai-search': 'https://openai.com/searchbot.json',
    'gptbot': 'https://openai.com/gptbot.json',
    'chatgpt-user': 'https://openai.com/chatgpt-user.json',
    'anthropic': 'https://claude.com/crawling/bots.json',
}
# Match actual tokens, not URLs containing a provider name or substring lookalikes.
BOTS = (
    ('Googlebot', 'search', 'google'),
    ('bingbot', 'search', 'bing'),
    ('OAI-SearchBot', 'search', 'oai-search'),
    ('GPTBot', 'training', 'gptbot'),
    ('ChatGPT-User', 'user_fetch', 'chatgpt-user'),
    ('Claude-SearchBot', 'search', 'anthropic'),
    ('ClaudeBot', 'training', 'anthropic'),
    ('Claude-User', 'user_fetch', 'anthropic'),
)
PATTERNS = [(re.compile(r'(?<![\w/.-])' + re.escape(name) + r'(?:/\d[^\s;)]*)?(?=$|[\s;)])', re.I),
             name, role, source) for name, role, source in BOTS]
HOSTS = {'system-strzelecki.pl', 'www.system-strzelecki.pl'}
# Report only public route templates; never arbitrary paths, slugs, IDs or query values.
PUBLIC_PATHS = {'/', '/robots.txt', '/sitemap.xml', '/competitions', '/competitions/map',
                '/trainings', '/trainings/map', '/shooting-ranges/map', '/historical-results',
                '/live-results', '/premium', '/premium/regulamin', '/kontakt', '/regulamin',
                '/polityka-prywatnosci', '/pobierz-aplikacje', '/wesprzyj-nas',
                '/maintenance/status', '/maintenance/recovery.js'}


def fetch_source(item):
    name, url = item
    metadata = {'url': url, 'fetched_at': datetime.now(UTC).isoformat()}
    try:
        request = Request(url, headers={'User-Agent': 'ShootingSystemBotReport/1.0'})
        with urlopen(request, timeout=15) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError('oversize')
        data = json.loads(raw)
        networks = []
        for prefix in data['prefixes']:
            values = [value for key, value in prefix.items() if key in ('ipv4Prefix', 'ipv6Prefix')]
            if len(values) != 1:
                raise ValueError('invalid prefix')
            networks.append(ipaddress.ip_network(values[0]))
        if not networks:
            raise ValueError('empty prefixes')
        metadata.update(status='ok', sha256=hashlib.sha256(raw).hexdigest(),
                        creation_time=data.get('creationTime'), prefix_count=len(networks))
        return name, networks, metadata
    except HTTPError as error:
        reason = f'http_{error.code}'
    except (URLError, OSError, ValueError, KeyError, TypeError, AttributeError):
        reason = 'fetch_or_schema_error'
    metadata.update(status='unavailable', reason=reason)
    return name, None, metadata


def identify(ua):
    matches = [(name, role, source) for pattern, name, role, source in PATTERNS if pattern.search(ua)]
    if len(matches) > 1:
        return 'ambiguous', 'unknown', None
    return matches[0] if matches else ('unclassified', 'unknown', None)


def verify(ip, source, networks, test=False, bot=''):
    if test:
        return 'declared', 'test_request'
    if bot == 'ambiguous':
        return 'unresolved', 'multiple_bot_tokens'
    if source is None:
        return 'not_assessed', 'outside_selected_bots'
    if networks.get(source) is None:
        return 'unresolved', 'source_unavailable'
    if any(ip in network for network in networks[source]):
        return 'verified', 'current_official_ip_range'
    return 'declared', 'ip_not_in_current_official_ranges'


def path_group(path):
    path = path.split('?', 1)[0]
    if path in PUBLIC_PATHS:
        return path
    if re.fullmatch(r'/(competitions|trainings)/\d+', path):
        return '/' + path.split('/')[1] + '/:id'
    if re.fullmatch(r'/(historical-results|live-results)/\d+(?:/\d+)?', path):
        return '/' + path.split('/')[1] + '/:id' * (len(path.split('/')) - 2)
    if path.startswith('/api/'):
        return '/api/:redacted'
    if path.startswith('/_next/'):
        return '/_next/:asset'
    return '/:other'


def aggregate(paths, start, end, networks):
    counts = Counter()
    stats = Counter(files=len(paths))
    first = last = None
    for path in paths:
        opener = gzip.open if str(path).endswith('.gz') else open
        with opener(path, 'rt', encoding='utf-8', errors='replace') as stream:
            for line in stream:
                stats['lines'] += 1
                try:
                    row = json.loads(line)
                    if row['schema'] != 1:
                        raise ValueError('schema')
                    stamp = datetime.fromisoformat(row['time'])
                    if stamp.tzinfo is None:
                        raise ValueError('timezone')
                    if not start <= stamp < end:
                        continue
                    ip = ipaddress.ip_address(row['ip'])
                    status = int(row['status'])
                    if not 100 <= status <= 599:
                        raise ValueError('status')
                    bot, role, source = identify(row['ua'])
                    test = 'shootingbotaudittest/' in row['ua'].lower() or ip.is_loopback
                    verification, reason = verify(ip, source, networks, test, bot)
                    host = row['host'].lower()
                    host = host if host in HOSTS else ':other'
                    scheme = row['scheme'] if row['scheme'] in ('http', 'https') else ':other'
                    blocked = row['maintenance_blocked']
                    if blocked not in ('0', '1'):
                        raise ValueError('maintenance_blocked')
                    key = (host, scheme, bot, role, verification, reason, test,
                           stamp.astimezone(UTC).strftime('%Y-%m-%dT%H:00:00Z'),
                           path_group(row['path']), status, blocked == '1')
                    counts[key] += 1
                    stats['requests'] += 1
                    first = min(first, stamp) if first else stamp
                    last = max(last, stamp) if last else stamp
                except (ValueError, KeyError, TypeError, AttributeError):
                    stats['malformed_lines'] += 1
    fields = ('host', 'scheme', 'bot', 'role', 'verification', 'reason', 'test', 'hour_utc',
              'path_group', 'status', 'maintenance_blocked')
    return {'stats': dict(stats), 'observed_first': first.isoformat() if first else None,
            'observed_last': last.isoformat() if last else None,
            'rows': [dict(zip(fields, key), count=value) for key, value in sorted(counts.items())]}


def write_report(directory, report, now):
    directory.mkdir(parents=True, exist_ok=True, mode=0o750)
    # Only this tool's own dated files are eligible; do not delete unrelated files.
    for old in directory.glob('bots-????-??-??.json'):
        try:
            day = date.fromisoformat(old.stem[5:])
        except ValueError:
            continue
        if day < (now - timedelta(days=89)).date():
            old.unlink()
    target = directory / ('bots-' + report['date_utc'] + '.json')
    fd, temporary = tempfile.mkstemp(prefix='.bots-', dir=directory)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--log', default='/var/log/nginx/shooting-bots.log*',
                        help='JSON log glob, including rotated .gz; quote the glob')
    parser.add_argument('--date', type=date.fromisoformat, help='UTC date (default: yesterday)')
    parser.add_argument('--output-dir', type=Path, default=Path('/var/lib/shooting-system/bot-reports'))
    args = parser.parse_args()
    now = datetime.now(UTC)
    day = args.date or (now - timedelta(days=1)).date()
    if not (now - timedelta(days=89)).date() <= day <= now.date():
        parser.error('date must be within the last 90 UTC dates')
    start = datetime.combine(day, time(), UTC)
    end = min(start + timedelta(days=1), now)
    # Strict glob avoids accidentally ingesting copied backups / duplicate inputs.
    paths = sorted(path for path in glob.glob(args.log)
                   if re.search(r'\.log(?:\.\d+(?:\.gz)?)?$', path))
    if not paths:
        parser.error('no matching JSON log files; report not generated')
    with ThreadPoolExecutor(max_workers=6) as executor:
        fetched = list(executor.map(fetch_source, SOURCES.items()))
    networks = {name: nets for name, nets, _ in fetched}
    report = {'schema': 1, 'generated_at': now.isoformat(), 'date_utc': day.isoformat(),
              'period_start': start.isoformat(), 'period_end_exclusive': end.isoformat(),
              'partial_day': end < start + timedelta(days=1),
              'meaning': 'Requests, not user visits, indexing, citations or AI referrals. '
                         'Verification uses current official IP ranges at report generation, '
                         'not historical ownership or authentication of a specific bot role. '
                         'Test rows must be excluded from organic robot totals. '
                         'Unclassified requests are not assumed human. Missing rows are not proof of no crawling.',
              'coverage': [name for name, _, _ in BOTS],
              'sources': {name: meta for name, _, meta in fetched}}
    report.update(aggregate(paths, start, end, networks))
    output = write_report(args.output_dir, report, now)
    print(json.dumps({'report': str(output), 'stats': report['stats'],
                      'unavailable_sources': [name for name, nets, _ in fetched if nets is None]}))


if __name__ == '__main__':
    main()
