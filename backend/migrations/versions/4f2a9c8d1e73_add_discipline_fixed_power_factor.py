"""add discipline fixed power factor

Revision ID: 4f2a9c8d1e73
Revises: 0f4c8d2e7a91
Create Date: 2026-07-01 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f2a9c8d1e73"
down_revision: Union[str, Sequence[str], None] = "0f4c8d2e7a91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("disciplines", sa.Column("fixed_power_factor", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("disciplines", "fixed_power_factor")
