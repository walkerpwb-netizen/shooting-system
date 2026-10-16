"""add user activation and shooter timestamps

Revision ID: 5c7e9a1b3d6f
Revises: 4e2b9c7a1d5f
Create Date: 2026-10-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5c7e9a1b3d6f"
down_revision: Union[str, Sequence[str], None] = "4e2b9c7a1d5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("activated_at", sa.String(), nullable=True))
    op.add_column("users", sa.Column("shooter_since", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "shooter_since")
    op.drop_column("users", "activated_at")
