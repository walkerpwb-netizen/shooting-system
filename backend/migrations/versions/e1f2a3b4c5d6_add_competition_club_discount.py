"""add competition club discount

Revision ID: e1f2a3b4c5d6
Revises: d9b7c3e5a1f4
Create Date: 2026-07-02 21:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d9b7c3e5a1f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "competitions",
        sa.Column(
            "club_discount_enabled",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "competitions",
        sa.Column(
            "club_discount_scope",
            sa.String(),
            nullable=False,
            server_default="competition",
        ),
    )
    op.add_column(
        "competitions",
        sa.Column(
            "club_discount_amount",
            sa.String(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("competitions", "club_discount_amount")
    op.drop_column("competitions", "club_discount_scope")
    op.drop_column("competitions", "club_discount_enabled")
