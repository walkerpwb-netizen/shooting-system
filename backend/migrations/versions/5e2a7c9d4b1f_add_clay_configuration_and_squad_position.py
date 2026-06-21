"""add clay configuration and squad position

Revision ID: 5e2a7c9d4b1f
Revises: c6d7e8f9a0b1
Create Date: 2026-06-19 18:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5e2a7c9d4b1f"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("disciplines", sa.Column("clay_variant", sa.String(), nullable=True))
    op.add_column("disciplines", sa.Column("clay_series_count", sa.Integer(), nullable=True))
    op.add_column("participant_disciplines", sa.Column("squad_position", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE disciplines
        SET clay_variant = trap_variant,
            clay_series_count = trap_series_count
        WHERE discipline_type = 'trap'
        """
    )

    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            WITH positioned AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY discipline_id, squad_group_number
                        ORDER BY id
                    ) AS position_number
                FROM participant_disciplines
                WHERE squad_group_number IS NOT NULL
            )
            UPDATE participant_disciplines
            SET squad_position = positioned.position_number
            FROM positioned
            WHERE participant_disciplines.id = positioned.id
            """
        )
    else:
        op.execute(
            """
            WITH positioned AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY discipline_id, squad_group_number
                        ORDER BY id
                    ) AS position_number
                FROM participant_disciplines
                WHERE squad_group_number IS NOT NULL
            )
            UPDATE participant_disciplines
            SET squad_position = (
                SELECT position_number
                FROM positioned
                WHERE positioned.id = participant_disciplines.id
            )
            WHERE id IN (SELECT id FROM positioned)
            """
        )


def downgrade() -> None:
    op.drop_column("participant_disciplines", "squad_position")
    op.drop_column("disciplines", "clay_series_count")
    op.drop_column("disciplines", "clay_variant")
