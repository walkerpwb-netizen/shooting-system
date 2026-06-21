"""add pzss license calendar competitions

Revision ID: 6a1d9c8e4f20
Revises: f2a6c9d4b8e1
Create Date: 2026-06-08 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6a1d9c8e4f20"
down_revision: Union[str, Sequence[str], None] = "f2a6c9d4b8e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "competitions",
        sa.Column(
            "pzss_license_calendar",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("competitions", "pzss_license_calendar")
