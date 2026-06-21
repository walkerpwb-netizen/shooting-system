"""add trap discipline fields

Revision ID: d5c8a7f1e2b9
Revises: 9c2d5e7f1a83
Create Date: 2026-06-16 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5c8a7f1e2b9"
down_revision: Union[str, Sequence[str], None] = "9c2d5e7f1a83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("disciplines", sa.Column("trap_variant", sa.String(), nullable=True))
    op.add_column("disciplines", sa.Column("trap_series_count", sa.Integer(), nullable=True))
    op.add_column("disciplines", sa.Column("clay_price", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("disciplines", "clay_price")
    op.drop_column("disciplines", "trap_series_count")
    op.drop_column("disciplines", "trap_variant")
