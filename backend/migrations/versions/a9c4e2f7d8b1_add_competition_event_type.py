"""add competition event type

Revision ID: a9c4e2f7d8b1
Revises: 3e9b1c7d4a2f
Create Date: 2026-09-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9c4e2f7d8b1"
down_revision: Union[str, None] = "3e9b1c7d4a2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "competitions",
        sa.Column(
            "event_type",
            sa.String(),
            nullable=False,
            server_default="competition",
        ),
    )
    op.execute("UPDATE competitions SET event_type = 'competition' WHERE event_type IS NULL OR event_type = ''")


def downgrade() -> None:
    op.drop_column("competitions", "event_type")
