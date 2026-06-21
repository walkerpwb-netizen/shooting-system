"""add achievement timeline index

Revision ID: 2f8c1a7d9e4b
Revises: 5e2a7c9d4b1f
Create Date: 2026-06-21 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "2f8c1a7d9e4b"
down_revision: Union[str, Sequence[str], None] = "5e2a7c9d4b1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_achievements_user_timeline",
        "achievements",
        ["user_email", "awarded_at", "competition_id", "place"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_achievements_user_timeline",
        table_name="achievements",
    )
