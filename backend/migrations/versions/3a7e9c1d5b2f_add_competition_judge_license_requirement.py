"""add competition judge license requirement

Revision ID: 3a7e9c1d5b2f
Revises: 2f8c1a7d9e4b
Create Date: 2026-06-21 20:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3a7e9c1d5b2f"
down_revision: Union[str, Sequence[str], None] = "2f8c1a7d9e4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "competitions",
        sa.Column(
            "requires_licensed_judge",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("competitions", "requires_licensed_judge")
