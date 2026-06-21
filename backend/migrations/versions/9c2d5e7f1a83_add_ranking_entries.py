"""add ranking entries

Revision ID: 9c2d5e7f1a83
Revises: 6a1d9c8e4f20
Create Date: 2026-06-14 20:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c2d5e7f1a83"
down_revision: Union[str, Sequence[str], None] = "6a1d9c8e4f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ranking_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("voivodeship", sa.String(), server_default="", nullable=False),
        sa.Column("metric", sa.String(), nullable=False),
        sa.Column("metric_label", sa.String(), nullable=False),
        sa.Column("place", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("club", sa.String(), nullable=True),
        sa.Column("points", sa.String(), nullable=False),
        sa.Column("points_value", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "scope",
            "voivodeship",
            "metric",
            "user_id",
            name="uq_ranking_entries_scope_metric_user",
        ),
    )
    op.create_index(
        op.f("ix_ranking_entries_id"),
        "ranking_entries",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ranking_entries_lookup",
        "ranking_entries",
        ["scope", "voivodeship", "metric", "place"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ranking_entries_lookup", table_name="ranking_entries")
    op.drop_index(op.f("ix_ranking_entries_id"), table_name="ranking_entries")
    op.drop_table("ranking_entries")
