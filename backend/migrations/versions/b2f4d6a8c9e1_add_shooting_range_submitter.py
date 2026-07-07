"""add shooting range submitter

Revision ID: b2f4d6a8c9e1
Revises: a7c9e2d4f6b8
Create Date: 2026-07-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2f4d6a8c9e1"
down_revision: Union[str, Sequence[str], None] = "a7c9e2d4f6b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shooting_range_submissions", sa.Column("submitted_by_user_id", sa.Integer(), nullable=True))
    op.add_column("shooting_range_submissions", sa.Column("submitted_by_email", sa.String(), nullable=True))
    op.add_column("shooting_range_submissions", sa.Column("submitted_by_name", sa.String(), nullable=True))
    op.create_index(
        op.f("ix_shooting_range_submissions_submitted_by_user_id"),
        "shooting_range_submissions",
        ["submitted_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_shooting_range_submissions_submitted_by_user_id"),
        table_name="shooting_range_submissions",
    )
    op.drop_column("shooting_range_submissions", "submitted_by_name")
    op.drop_column("shooting_range_submissions", "submitted_by_email")
    op.drop_column("shooting_range_submissions", "submitted_by_user_id")
