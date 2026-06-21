"""add password reset expires at

Revision ID: d2e6f8a1b9c3
Revises: c4f7a8d9e2b1
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d2e6f8a1b9c3"
down_revision: Union[str, Sequence[str], None] = "c4f7a8d9e2b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_reset_expires_at", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "password_reset_expires_at")
