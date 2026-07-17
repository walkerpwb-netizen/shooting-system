"""add user created at

Revision ID: d4e8f1a9c2b3
Revises: c3d5e7f9a1b2
Create Date: 2026-07-17 08:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e8f1a9c2b3"
down_revision: Union[str, Sequence[str], None] = "c3d5e7f9a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("created_at", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "created_at")
