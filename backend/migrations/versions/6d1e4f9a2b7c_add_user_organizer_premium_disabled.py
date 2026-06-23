"""add user organizer premium disabled

Revision ID: 6d1e4f9a2b7c
Revises: 4c9f2a6b8d1e
Create Date: 2026-06-23 09:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "6d1e4f9a2b7c"
down_revision = "4c9f2a6b8d1e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "premium_organizer_disabled",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute("UPDATE users SET premium_organizer_disabled = 0 WHERE premium_organizer_disabled IS NULL")


def downgrade() -> None:
    op.drop_column("users", "premium_organizer_disabled")
