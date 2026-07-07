"""add shooting range submissions

Revision ID: 7b2d9f4a6c10
Revises: 4c9f2a6b8d1e, f4b6c8d1e2a3
Create Date: 2026-07-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7b2d9f4a6c10"
down_revision: Union[str, Sequence[str], None] = ("4c9f2a6b8d1e", "f4b6c8d1e2a3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shooting_range_submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("website", sa.String(), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("reviewed_at", sa.String(), nullable=True),
        sa.Column("reviewed_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_shooting_range_submissions_id"), "shooting_range_submissions", ["id"], unique=False)
    op.create_index(op.f("ix_shooting_range_submissions_status"), "shooting_range_submissions", ["status"], unique=False)
    op.create_index(op.f("ix_shooting_range_submissions_created_at"), "shooting_range_submissions", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_shooting_range_submissions_created_at"), table_name="shooting_range_submissions")
    op.drop_index(op.f("ix_shooting_range_submissions_status"), table_name="shooting_range_submissions")
    op.drop_index(op.f("ix_shooting_range_submissions_id"), table_name="shooting_range_submissions")
    op.drop_table("shooting_range_submissions")
