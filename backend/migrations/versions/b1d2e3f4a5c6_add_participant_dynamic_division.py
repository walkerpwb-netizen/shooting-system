"""add participant dynamic division

Revision ID: b1d2e3f4a5c6
Revises: ab4e6c9d2f10
Create Date: 2026-06-28 17:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1d2e3f4a5c6"
down_revision: Union[str, Sequence[str], None] = "ab4e6c9d2f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("participant_disciplines", sa.Column("division", sa.String(), nullable=True))
    op.add_column("participant_disciplines", sa.Column("power_factor", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("participant_disciplines", "power_factor")
    op.drop_column("participant_disciplines", "division")
