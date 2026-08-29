"""add user activation expires at

Revision ID: 3e9b1c7d4a2f
Revises: 2f8a1d7c9e34
Create Date: 2026-08-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3e9b1c7d4a2f"
down_revision: Union[str, Sequence[str], None] = "2f8a1d7c9e34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("activation_expires_at", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "activation_expires_at")
