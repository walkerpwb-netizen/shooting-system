"""Add the administrator-maintained gun shop directory.

Revision ID: c4e8a2d6f901
Revises: b9d5f7a1c486
"""

from alembic import op
import sqlalchemy as sa


revision = "c4e8a2d6f901"
down_revision = "b9d5f7a1c486"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "gun_shops",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("phone", sa.String(60), nullable=False),
        sa.Column("website", sa.String(300), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("license_number", sa.String(120), nullable=False),
        sa.Column("license_source", sa.String(500), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.Column("updated_by", sa.String(), nullable=False),
    )


def downgrade():
    op.drop_table("gun_shops")
