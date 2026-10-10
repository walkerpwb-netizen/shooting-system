"""add push preferences

Revision ID: 4e2b9c7a1d5f
Revises: 1c8e5a7d9b3f
Create Date: 2026-10-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4e2b9c7a1d5f"
down_revision: Union[str, Sequence[str], None] = "1c8e5a7d9b3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("new_events", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("my_event_cancelled", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("my_event_started", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("organizer_participant_changes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.String(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_push_preferences_user_id"),
    )
    op.create_index(op.f("ix_push_preferences_id"), "push_preferences", ["id"], unique=False)
    op.create_index(op.f("ix_push_preferences_user_id"), "push_preferences", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_push_preferences_user_id"), table_name="push_preferences")
    op.drop_index(op.f("ix_push_preferences_id"), table_name="push_preferences")
    op.drop_table("push_preferences")
