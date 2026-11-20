"""Add Meta news cache and synchronization state."""
from alembic import op
import sqlalchemy as sa

revision = "92b9c7a08f31"
down_revision = "9f17c0a2b341"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("meta_news_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("source_id", sa.String(128), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("published_at", sa.String(40), nullable=False),
        sa.Column("permalink", sa.Text(), nullable=False),
        sa.Column("media_json", sa.Text(), nullable=False),
        sa.Column("missing_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("source", "source_id", name="uq_meta_news_source_id"))
    op.create_index("ix_meta_news_posts_published_at", "meta_news_posts", ["published_at"])
    op.create_table("meta_news_status",
        sa.Column("source", sa.String(16), primary_key=True),
        sa.Column("last_attempt_at", sa.String(40)),
        sa.Column("last_success_at", sa.String(40)),
        sa.Column("error", sa.String(255)),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("alert_sent", sa.Boolean(), nullable=False),
        sa.Column("data_access_expires_at", sa.String(40)),
        sa.Column("token_expires_at", sa.String(40)))


def downgrade():
    op.drop_table("meta_news_status")
    op.drop_index("ix_meta_news_posts_published_at", table_name="meta_news_posts")
    op.drop_table("meta_news_posts")
