"""add competition map location

Revision ID: 0f4c8d2e7a91
Revises: b1d2e3f4a5c6
Create Date: 2026-07-01 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0f4c8d2e7a91"
down_revision: Union[str, Sequence[str], None] = "b1d2e3f4a5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("competitions", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("competitions", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("competitions", "longitude")
    op.drop_column("competitions", "latitude")
