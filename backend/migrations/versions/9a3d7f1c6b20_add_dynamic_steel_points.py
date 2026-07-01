"""add dynamic steel points

Revision ID: 9a3d7f1c6b20
Revises: 4f2a9c8d1e73
Create Date: 2026-07-01 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a3d7f1c6b20"
down_revision: Union[str, Sequence[str], None] = "4f2a9c8d1e73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("competition_stages", sa.Column("popper_points", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("competition_stages", sa.Column("mini_popper_points", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("competition_stages", sa.Column("plate_points", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("competition_stages", sa.Column("mini_plate_points", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("stage_scores", sa.Column("popper_hits", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stage_scores", sa.Column("popper_misses", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stage_scores", sa.Column("mini_popper_hits", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stage_scores", sa.Column("mini_popper_misses", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stage_scores", sa.Column("plate_hits", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stage_scores", sa.Column("plate_misses", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stage_scores", sa.Column("mini_plate_hits", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("stage_scores", sa.Column("mini_plate_misses", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("stage_scores", "mini_plate_misses")
    op.drop_column("stage_scores", "mini_plate_hits")
    op.drop_column("stage_scores", "plate_misses")
    op.drop_column("stage_scores", "plate_hits")
    op.drop_column("stage_scores", "mini_popper_misses")
    op.drop_column("stage_scores", "mini_popper_hits")
    op.drop_column("stage_scores", "popper_misses")
    op.drop_column("stage_scores", "popper_hits")
    op.drop_column("competition_stages", "mini_plate_points")
    op.drop_column("competition_stages", "plate_points")
    op.drop_column("competition_stages", "mini_popper_points")
    op.drop_column("competition_stages", "popper_points")
