"""add license qr hidden fields

Revision ID: 3b7f2c9d1a4e
Revises: 8f4d2c1a9b7e
Create Date: 2026-05-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3b7f2c9d1a4e"
down_revision: Union[str, Sequence[str], None] = "8f4d2c1a9b7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("license_uuid", sa.String(), nullable=True))
    op.add_column("users", sa.Column("license_club_code", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "license_club_code")
    op.drop_column("users", "license_uuid")
