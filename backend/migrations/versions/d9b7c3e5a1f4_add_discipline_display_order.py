"""add discipline display order

Revision ID: d9b7c3e5a1f4
Revises: c8e2f4a9b6d1
Create Date: 2026-07-02 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9b7c3e5a1f4"
down_revision: Union[str, Sequence[str], None] = "c8e2f4a9b6d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "disciplines",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("disciplines", "display_order")
