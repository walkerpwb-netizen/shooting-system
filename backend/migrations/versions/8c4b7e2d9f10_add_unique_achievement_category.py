"""add unique achievement category

Revision ID: 8c4b7e2d9f10
Revises: 1f6a8c3e9b2d
Create Date: 2026-06-27 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "8c4b7e2d9f10"
down_revision: Union[str, None] = "1f6a8c3e9b2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    op.execute(
        """
        DELETE FROM achievements
        WHERE id IN (
            SELECT id
            FROM (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY competition_id, participant_id, category_id
                        ORDER BY awarded_at DESC, place ASC, id DESC
                    ) AS duplicate_number
                FROM achievements
            ) duplicates
            WHERE duplicates.duplicate_number > 1
        )
        """
    )

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("achievements") as batch_op:
            batch_op.create_unique_constraint(
                "uq_achievements_competition_participant_category",
                ["competition_id", "participant_id", "category_id"],
            )
    else:
        op.create_unique_constraint(
            "uq_achievements_competition_participant_category",
            "achievements",
            ["competition_id", "participant_id", "category_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("achievements") as batch_op:
            batch_op.drop_constraint(
                "uq_achievements_competition_participant_category",
                type_="unique",
            )
    else:
        op.drop_constraint(
            "uq_achievements_competition_participant_category",
            "achievements",
            type_="unique",
        )
