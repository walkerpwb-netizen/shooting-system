"""add competition club discount clubs

Revision ID: c3d5e7f9a1b2
Revises: b2f4d6a8c9e1
Create Date: 2026-07-09 14:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d5e7f9a1b2"
down_revision: Union[str, Sequence[str], None] = "b2f4d6a8c9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "competitions",
        sa.Column(
            "club_discount_clubs",
            sa.Text(),
            nullable=True,
        ),
    )
    op.execute(
        """
        UPDATE competitions
        SET club_discount_clubs = organizer_full_name
        WHERE club_discount_enabled = 1
          AND COALESCE(TRIM(club_discount_clubs), '') = ''
          AND COALESCE(TRIM(organizer_full_name), '') != ''
        """
    )


def downgrade() -> None:
    op.drop_column("competitions", "club_discount_clubs")
