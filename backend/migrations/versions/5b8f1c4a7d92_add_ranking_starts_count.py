"""Cache the number of discipline starts contributing to each ranking.

Revision ID: 5b8f1c4a7d92
Revises: 6e3b8d2f9a41
"""

from alembic import op
import sqlalchemy as sa


revision = "5b8f1c4a7d92"
down_revision = "6e3b8d2f9a41"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ranking_entries", sa.Column(
        "starts_count", sa.Integer(), nullable=False, server_default="0",
    ))


def downgrade():
    op.drop_column("ranking_entries", "starts_count")
