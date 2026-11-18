#!/usr/bin/env python3
"""Rebuild derived public event-logo files after restoring the database."""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from database import SessionLocal  # noqa: E402
from event_logos import materialize_event_logo  # noqa: E402
from models import Competition  # noqa: E402


def main():
    count = 0
    with SessionLocal() as db:
        for organizer, sponsor in db.query(Competition.organizer_logo, Competition.sponsor_logo).yield_per(100):
            for logo in (organizer, sponsor):
                if logo and logo.startswith('data:'):
                    materialize_event_logo(logo, BACKEND / 'uploads' / 'event-logos')
                    count += 1
    print(f'Restored {count} event logo references')


if __name__ == '__main__':
    main()
