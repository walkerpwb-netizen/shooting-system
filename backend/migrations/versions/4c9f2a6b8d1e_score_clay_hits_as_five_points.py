"""score clay hits as five points

Revision ID: 4c9f2a6b8d1e
Revises: 3a7e9c1d5b2f
Create Date: 2026-06-22 00:00:00.000000
"""

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4c9f2a6b8d1e"
down_revision: Union[str, Sequence[str], None] = "3a7e9c1d5b2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def clay_hit_count(discipline_type: str, result_data: str) -> int | None:
    try:
        parsed = json.loads(result_data or "")
    except (TypeError, ValueError):
        return None

    if discipline_type == "trap" and isinstance(parsed, list):
        return sum(1 for score in parsed if score == 1)

    if discipline_type == "skeet" and isinstance(parsed, dict):
        return sum(
            1
            for round_data in parsed.get("rounds", [])
            if isinstance(round_data, dict)
            for target in round_data.get("targets", [])
            if isinstance(target, dict) and target.get("score") == 1
        )

    return None


def rescore_clay_results(points_per_hit: int) -> None:
    connection = op.get_bind()
    rows = connection.execute(sa.text("""
        SELECT dr.id, d.discipline_type, dr.result_data
        FROM discipline_results AS dr
        JOIN disciplines AS d ON d.id = dr.discipline_id
        WHERE d.discipline_type IN ('trap', 'skeet')
          AND dr.result_data IS NOT NULL
          AND dr.result_data <> ''
    """)).mappings()

    for row in rows:
        hit_count = clay_hit_count(row["discipline_type"], row["result_data"])

        if hit_count is None:
            continue

        connection.execute(
            sa.text("UPDATE discipline_results SET points = :points WHERE id = :result_id"),
            {
                "points": str(hit_count * points_per_hit),
                "result_id": row["id"],
            },
        )


def upgrade() -> None:
    rescore_clay_results(5)


def downgrade() -> None:
    rescore_clay_results(1)
