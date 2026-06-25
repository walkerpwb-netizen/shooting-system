"""convert hunting trap to trap variant

Revision ID: 7a4c9e2d1b6f
Revises: 6d1e4f9a2b7c
Create Date: 2026-06-25 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "7a4c9e2d1b6f"
down_revision: Union[str, Sequence[str], None] = "6d1e4f9a2b7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE disciplines
        SET discipline_type = 'trap',
            trap_variant = 'hunting-trap-20',
            trap_series_count = 1,
            clay_variant = 'hunting-trap-20',
            clay_series_count = 1,
            shots_count = 20
        WHERE discipline_type = 'hunting-trap'
        """
    )
    op.execute(
        """
        DELETE FROM ranking_entries
        WHERE metric = 'hunting-trap'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE disciplines
        SET discipline_type = 'hunting-trap',
            trap_variant = NULL,
            trap_series_count = 0,
            clay_variant = 'hunting-trap-20',
            clay_series_count = 1,
            shots_count = 20
        WHERE discipline_type = 'trap'
          AND clay_variant = 'hunting-trap-20'
        """
    )
