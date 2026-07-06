"""add one hand bonus to disciplines

Revision ID: f4b6c8d1e2a3
Revises: e1f2a3b4c5d6
Create Date: 2026-07-06 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4b6c8d1e2a3"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "disciplines",
        sa.Column(
            "one_hand_bonus_enabled",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        """
        UPDATE disciplines
        SET one_hand_bonus_enabled = 1
        WHERE lower(coalesce(description, '')) LIKE '%jednej r%'
          AND lower(coalesce(description, '')) LIKE '%+5%'
        """
    )


def downgrade() -> None:
    op.drop_column("disciplines", "one_hand_bonus_enabled")
