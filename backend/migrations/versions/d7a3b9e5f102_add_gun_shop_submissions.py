"""Shop submissions and explicit public map publication.

Revision ID: d7a3b9e5f102
Revises: c4e8a2d6f901
"""
from alembic import op
import hashlib
import sqlalchemy as sa

revision = "d7a3b9e5f102"
down_revision = "c4e8a2d6f901"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("gun_shops", sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("gun_shops", sa.Column("identity_key", sa.String(64), nullable=True))
    shops = sa.table("gun_shops", sa.column("id", sa.Integer()), sa.column("name", sa.String()),
        sa.column("latitude", sa.Float()), sa.column("longitude", sa.Float()), sa.column("identity_key", sa.String()))
    connection = op.get_bind()
    seen = set()
    for shop in connection.execute(sa.select(shops).order_by(shops.c.id)).mappings().all():
        if shop["latitude"] is None or shop["longitude"] is None:
            continue
        name = " ".join(shop["name"].casefold().split())
        value = f'{name}|{shop["latitude"]:.6f}|{shop["longitude"]:.6f}'
        key = hashlib.sha256(value.encode()).hexdigest()
        # Preserve any older duplicate records; reserve the identity for the first.
        if key not in seen:
            connection.execute(shops.update().where(shops.c.id == shop["id"]).values(identity_key=key))
            seen.add(key)
    op.create_index("uq_gun_shops_identity_key", "gun_shops", ["identity_key"], unique=True)
    op.create_table(
        "gun_shop_submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_shop_id", sa.Integer(), nullable=True),
        sa.Column("approved_shop_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("phone", sa.String(60), nullable=False),
        sa.Column("website", sa.String(300), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("license_number", sa.String(120), nullable=False),
        sa.Column("license_source", sa.String(500), nullable=False),
        sa.Column("submitted_by_email", sa.String(), nullable=False),
        sa.Column("submitted_by_name", sa.String(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("reviewed_at", sa.String(), nullable=True),
        sa.Column("reviewed_by", sa.String(), nullable=True),
    )


def downgrade():
    op.drop_table("gun_shop_submissions")
    op.drop_index("uq_gun_shops_identity_key", table_name="gun_shops")
    op.drop_column("gun_shops", "identity_key")
    op.drop_column("gun_shops", "is_published")
