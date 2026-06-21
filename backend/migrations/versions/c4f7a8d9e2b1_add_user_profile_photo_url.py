"""add user profile photo url

Revision ID: c4f7a8d9e2b1
Revises: b8d3f6a9c2e4
Create Date: 2026-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4f7a8d9e2b1"
down_revision: Union[str, Sequence[str], None] = "b8d3f6a9c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_photo_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_photo_url")
