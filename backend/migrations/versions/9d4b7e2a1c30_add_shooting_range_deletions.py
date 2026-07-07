"""add shooting range deletions

Revision ID: 9d4b7e2a1c30
Revises: 8a3f6d1c9b20
Create Date: 2026-07-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9d4b7e2a1c30"
down_revision: Union[str, Sequence[str], None] = "8a3f6d1c9b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shooting_range_deletions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("range_id", sa.String(), nullable=False),
        sa.Column("deleted_at", sa.String(), nullable=False),
        sa.Column("deleted_by", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("range_id"),
    )
    op.create_index(op.f("ix_shooting_range_deletions_id"), "shooting_range_deletions", ["id"], unique=False)
    op.create_index(op.f("ix_shooting_range_deletions_range_id"), "shooting_range_deletions", ["range_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_shooting_range_deletions_range_id"), table_name="shooting_range_deletions")
    op.drop_index(op.f("ix_shooting_range_deletions_id"), table_name="shooting_range_deletions")
    op.drop_table("shooting_range_deletions")
