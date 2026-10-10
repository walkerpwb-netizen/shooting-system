"""add push subscriptions

Revision ID: 1c8e5a7d9b3f
Revises: b7d1a9c4e2f8
Create Date: 2026-10-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1c8e5a7d9b3f"
down_revision: Union[str, Sequence[str], None] = "b7d1a9c4e2f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("device_name", sa.String(), nullable=True),
        sa.Column("platform", sa.String(), nullable=True),
        sa.Column("browser", sa.String(), nullable=True),
        sa.Column("login_source", sa.String(), nullable=True),
        sa.Column("push_status", sa.String(), nullable=False, server_default="unknown"),
        sa.Column("endpoint", sa.Text(), nullable=True),
        sa.Column("p256dh_key", sa.Text(), nullable=True),
        sa.Column("auth_key", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=True),
        sa.Column("last_seen_at", sa.String(), nullable=True),
        sa.Column("last_subscribed_at", sa.String(), nullable=True),
        sa.Column("disabled_at", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "device_id", name="uq_push_subscriptions_user_device"),
    )
    op.create_index(op.f("ix_push_subscriptions_id"), "push_subscriptions", ["id"], unique=False)
    op.create_index(op.f("ix_push_subscriptions_user_id"), "push_subscriptions", ["user_id"], unique=False)
    op.create_index(op.f("ix_push_subscriptions_device_id"), "push_subscriptions", ["device_id"], unique=False)
    op.create_index(op.f("ix_push_subscriptions_push_status"), "push_subscriptions", ["push_status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_push_subscriptions_push_status"), table_name="push_subscriptions")
    op.drop_index(op.f("ix_push_subscriptions_device_id"), table_name="push_subscriptions")
    op.drop_index(op.f("ix_push_subscriptions_user_id"), table_name="push_subscriptions")
    op.drop_index(op.f("ix_push_subscriptions_id"), table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
