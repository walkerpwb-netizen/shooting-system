"""limit squad groups to trap

Revision ID: f9a8c7d6e5b4
Revises: e7b4c2a9d6f1
Create Date: 2026-06-16 14:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f9a8c7d6e5b4"
down_revision: Union[str, Sequence[str], None] = "e7b4c2a9d6f1"
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
        )
        """
    )


def downgrade() -> None:
    pass
