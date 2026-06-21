"""limit squad groups to configured trap

Revision ID: a1b2c3d4e5f6
Revises: f9a8c7d6e5b4
Create Date: 2026-06-16 15:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f9a8c7d6e5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE participant_disciplines
        SET squad_group_number = NULL
        WHERE discipline_id IN (
            SELECT id
            FROM disciplines
            WHERE discipline_type <> 'trap'
               OR trap_variant IS NULL
               OR trap_variant = ''
               OR trap_series_count IS NULL
               OR trap_series_count <= 0
        )
        """
    )


def downgrade() -> None:
    pass
