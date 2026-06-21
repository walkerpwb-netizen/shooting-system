"""add user premium disabled

Revision ID: a6b4c8d2e5f1
Revises: 91c5e0d2f8a3
Create Date: 2026-05-31 23:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a6b4c8d2e5f1"
down_revision: Union[str, Sequence[str], None] = "91c5e0d2f8a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("premium_disabled", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute("UPDATE users SET premium_disabled = 0 WHERE premium_disabled IS NULL")


def downgrade() -> None:
    op.drop_column("users", "premium_disabled")
