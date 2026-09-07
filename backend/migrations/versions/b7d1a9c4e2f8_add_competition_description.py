"""add competition description

Revision ID: b7d1a9c4e2f8
Revises: a9c4e2f7d8b1
Create Date: 2026-09-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7d1a9c4e2f8"
down_revision: Union[str, None] = "a9c4e2f7d8b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("competitions", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("competitions", "description")
