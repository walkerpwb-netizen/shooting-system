"""add discipline fixed division

Revision ID: c8e2f4a9b6d1
Revises: 9a3d7f1c6b20
Create Date: 2026-07-02 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8e2f4a9b6d1"
down_revision: Union[str, Sequence[str], None] = "9a3d7f1c6b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("disciplines", sa.Column("fixed_division", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("disciplines", "fixed_division")
