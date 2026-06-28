"""add dynamic stage scoring

Revision ID: ab4e6c9d2f10
Revises: 8c4b7e2d9f10
Create Date: 2026-06-28 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ab4e6c9d2f10"
down_revision: Union[str, Sequence[str], None] = "8c4b7e2d9f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "competition_stages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("competition_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("stage_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("stage_type", sa.String(), server_default="short", nullable=False),
        sa.Column("briefing", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("min_rounds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("paper_targets", sa.Integer(), server_default="0", nullable=False),
        sa.Column("mini_paper_targets", sa.Integer(), server_default="0", nullable=False),
        sa.Column("classic_targets", sa.Integer(), server_default="0", nullable=False),
        sa.Column("paper_no_shoots", sa.Integer(), server_default="0", nullable=False),
        sa.Column("moving_targets", sa.Integer(), server_default="0", nullable=False),
        sa.Column("swingers", sa.Integer(), server_default="0", nullable=False),
        sa.Column("drop_turners", sa.Integer(), server_default="0", nullable=False),
        sa.Column("poppers", sa.Integer(), server_default="0", nullable=False),
        sa.Column("mini_poppers", sa.Integer(), server_default="0", nullable=False),
        sa.Column("plates", sa.Integer(), server_default="0", nullable=False),
        sa.Column("mini_plates", sa.Integer(), server_default="0", nullable=False),
        sa.Column("steel_no_shoots", sa.Integer(), server_default="0", nullable=False),
        sa.Column("penalty_miss", sa.String(), server_default="-10", nullable=False),
        sa.Column("penalty_no_shoot", sa.String(), server_default="-10", nullable=False),
        sa.Column("penalty_procedural", sa.String(), server_default="-10", nullable=False),
        sa.Column("penalty_ftsa", sa.String(), server_default="-10", nullable=False),
        sa.Column("penalty_extra_shot", sa.String(), server_default="-10", nullable=False),
        sa.Column("penalty_extra_hit", sa.String(), server_default="-10", nullable=False),
        sa.Column("custom_penalties_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["competition_id"], ["competitions.id"]),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("discipline_id", "stage_number", name="uq_competition_stages_discipline_stage_number"),
    )
    op.create_index(op.f("ix_competition_stages_competition_id"), "competition_stages", ["competition_id"], unique=False)
    op.create_index(op.f("ix_competition_stages_discipline_id"), "competition_stages", ["discipline_id"], unique=False)
    op.create_index(op.f("ix_competition_stages_id"), "competition_stages", ["id"], unique=False)

    op.create_table(
        "stage_scores",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stage_id", sa.Integer(), nullable=False),
        sa.Column("competition_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("competitor_id", sa.Integer(), nullable=False),
        sa.Column("shooter_id", sa.Integer(), nullable=True),
        sa.Column("squad_id", sa.Integer(), nullable=True),
        sa.Column("division", sa.String(), nullable=True),
        sa.Column("power_factor", sa.String(), server_default="minor", nullable=False),
        sa.Column("time_seconds", sa.String(), nullable=False),
        sa.Column("hits_a", sa.Integer(), server_default="0", nullable=False),
        sa.Column("hits_c", sa.Integer(), server_default="0", nullable=False),
        sa.Column("hits_d", sa.Integer(), server_default="0", nullable=False),
        sa.Column("paper_misses", sa.Integer(), server_default="0", nullable=False),
        sa.Column("steel_hits", sa.Integer(), server_default="0", nullable=False),
        sa.Column("steel_misses", sa.Integer(), server_default="0", nullable=False),
        sa.Column("no_shoots", sa.Integer(), server_default="0", nullable=False),
        sa.Column("procedurals", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ftsa", sa.Integer(), server_default="0", nullable=False),
        sa.Column("extra_shots", sa.Integer(), server_default="0", nullable=False),
        sa.Column("extra_hits", sa.Integer(), server_default="0", nullable=False),
        sa.Column("custom_penalties_json", sa.Text(), nullable=True),
        sa.Column("positive_points", sa.String(), server_default="0", nullable=False),
        sa.Column("penalty_points", sa.String(), server_default="0", nullable=False),
        sa.Column("final_points", sa.String(), server_default="0", nullable=False),
        sa.Column("hit_factor", sa.String(), server_default="0", nullable=False),
        sa.Column("stage_points", sa.String(), server_default="0", nullable=False),
        sa.Column("stage_percent", sa.String(), server_default="0", nullable=False),
        sa.Column("stage_place", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.String(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["competition_id"], ["competitions.id"]),
        sa.ForeignKeyConstraint(["competitor_id"], ["competition_participants.id"]),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.id"]),
        sa.ForeignKeyConstraint(["shooter_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["stage_id"], ["competition_stages.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stage_id", "competitor_id", name="uq_stage_scores_stage_competitor"),
    )
    op.create_index(op.f("ix_stage_scores_competition_id"), "stage_scores", ["competition_id"], unique=False)
    op.create_index(op.f("ix_stage_scores_competitor_id"), "stage_scores", ["competitor_id"], unique=False)
    op.create_index(op.f("ix_stage_scores_discipline_id"), "stage_scores", ["discipline_id"], unique=False)
    op.create_index(op.f("ix_stage_scores_id"), "stage_scores", ["id"], unique=False)
    op.create_index(op.f("ix_stage_scores_shooter_id"), "stage_scores", ["shooter_id"], unique=False)
    op.create_index(op.f("ix_stage_scores_stage_id"), "stage_scores", ["stage_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_stage_scores_stage_id"), table_name="stage_scores")
    op.drop_index(op.f("ix_stage_scores_shooter_id"), table_name="stage_scores")
    op.drop_index(op.f("ix_stage_scores_id"), table_name="stage_scores")
    op.drop_index(op.f("ix_stage_scores_discipline_id"), table_name="stage_scores")
    op.drop_index(op.f("ix_stage_scores_competitor_id"), table_name="stage_scores")
    op.drop_index(op.f("ix_stage_scores_competition_id"), table_name="stage_scores")
    op.drop_table("stage_scores")
    op.drop_index(op.f("ix_competition_stages_id"), table_name="competition_stages")
    op.drop_index(op.f("ix_competition_stages_discipline_id"), table_name="competition_stages")
    op.drop_index(op.f("ix_competition_stages_competition_id"), table_name="competition_stages")
    op.drop_table("competition_stages")
