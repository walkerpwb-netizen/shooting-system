"""add refresh token version

Revision ID: e4a9b7c2d8f5
Revises: d2e6f8a1b9c3
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4a9b7c2d8f5"
down_revision: Union[str, Sequence[str], None] = "d2e6f8a1b9c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "refresh_token_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column("users", "refresh_token_version", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "refresh_token_version")
