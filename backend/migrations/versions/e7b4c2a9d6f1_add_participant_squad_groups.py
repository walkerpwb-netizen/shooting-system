"""add participant squad groups

Revision ID: e7b4c2a9d6f1
Revises: d5c8a7f1e2b9
Create Date: 2026-06-16 13:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e7b4c2a9d6f1"
down_revision: Union[str, Sequence[str], None] = "d5c8a7f1e2b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "participant_disciplines",
        sa.Column("squad_group_number", sa.Integer(), nullable=True),
    )

    bind = op.get_bind()

    if bind.dialect.name == "postgresql":
        op.execute(
            """
            WITH numbered AS (
                SELECT
                    pd.id,
                    (((row_number() OVER (PARTITION BY pd.discipline_id ORDER BY pd.id)) - 1) / 5)::integer + 1
                        AS group_number
                FROM participant_disciplines pd
                JOIN competition_participants cp ON cp.id = pd.participant_id
                WHERE cp.entry_type = 'shooter' OR cp.entry_type IS NULL
            )
            UPDATE participant_disciplines
            SET squad_group_number = numbered.group_number
            FROM numbered
            WHERE participant_disciplines.id = numbered.id
            """
        )
    else:
        op.execute(
            """
            WITH numbered AS (
                SELECT
                    pd.id,
                    CAST((((row_number() OVER (PARTITION BY pd.discipline_id ORDER BY pd.id)) - 1) / 5) AS INTEGER) + 1
                        AS group_number
                FROM participant_disciplines pd
                JOIN competition_participants cp ON cp.id = pd.participant_id
                WHERE cp.entry_type = 'shooter' OR cp.entry_type IS NULL
            )
            UPDATE participant_disciplines
            SET squad_group_number = (
                SELECT group_number
                FROM numbered
                WHERE numbered.id = participant_disciplines.id
            )
            WHERE id IN (SELECT id FROM numbered)
            """
        )


def downgrade() -> None:
    op.drop_column("participant_disciplines", "squad_group_number")
