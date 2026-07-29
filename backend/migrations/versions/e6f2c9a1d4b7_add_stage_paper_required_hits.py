"""add stage paper required hits

Revision ID: e6f2c9a1d4b7
Revises: d4e8f1a9c2b3
Create Date: 2026-07-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f2c9a1d4b7"
down_revision: Union[str, Sequence[str], None] = "d4e8f1a9c2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "competition_stages",
        sa.Column("paper_required_hits", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        UPDATE competition_stages
        SET paper_required_hits = (
            COALESCE(paper_targets, 0)
            + COALESCE(mini_paper_targets, 0)
            + COALESCE(classic_targets, 0)
            + COALESCE(moving_targets, 0)
            + COALESCE(swingers, 0)
            + COALESCE(drop_turners, 0)
        ) * 2
        """
    )


def downgrade() -> None:
    op.drop_column("competition_stages", "paper_required_hits")
