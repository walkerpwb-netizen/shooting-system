"""add home posts

Revision ID: 1f6a8c3e9b2d
Revises: 7a4c9e2d1b6f
Create Date: 2026-06-25 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1f6a8c3e9b2d"
down_revision: Union[str, Sequence[str], None] = "7a4c9e2d1b6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "home_posts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_home_posts_created_at"),
        "home_posts",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_home_posts_id"),
        "home_posts",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_home_posts_id"), table_name="home_posts")
    op.drop_index(op.f("ix_home_posts_created_at"), table_name="home_posts")
    op.drop_table("home_posts")
