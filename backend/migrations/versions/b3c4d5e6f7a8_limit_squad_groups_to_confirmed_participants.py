"""limit squad groups to confirmed participants

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-06-16 16:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE participant_disciplines
        SET squad_group_number = NULL
        WHERE participant_id IN (
            SELECT id
            FROM competition_participants
            WHERE checked_in IS NULL
               OR checked_in <> 1
               OR paid IS NULL
               OR paid <> 1
        )
        """
    )


def downgrade() -> None:
    pass
