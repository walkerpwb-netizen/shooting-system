"""Remove shop license numbers from the directory and submission queue.

Revision ID: e8b4c0a6d213
Revises: d7a3b9e5f102
"""
from alembic import op
import sqlalchemy as sa

revision = "e8b4c0a6d213"
down_revision = "d7a3b9e5f102"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("gun_shop_submissions", "license_number")
    op.drop_column("gun_shops", "license_number")


def downgrade():
    op.add_column("gun_shops", sa.Column("license_number", sa.String(120), nullable=False, server_default=""))
    op.add_column("gun_shop_submissions", sa.Column("license_number", sa.String(120), nullable=False, server_default=""))
