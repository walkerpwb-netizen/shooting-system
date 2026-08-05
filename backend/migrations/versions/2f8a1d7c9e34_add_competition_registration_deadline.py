"""add competition registration deadline

Revision ID: 2f8a1d7c9e34
Revises: e6f2c9a1d4b7
Create Date: 2026-08-05 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2f8a1d7c9e34"
down_revision: Union[str, Sequence[str], None] = "e6f2c9a1d4b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "competitions",
        sa.Column("registration_deadline", sa.String(), nullable=True),
    )
    op.add_column(
        "competitions",
        sa.Column("min_participants", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("competitions", "min_participants")
    op.drop_column("competitions", "registration_deadline")
