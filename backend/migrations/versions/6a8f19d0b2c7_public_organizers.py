"""Add explicitly published organizer profiles and confirmed event links."""
from alembic import op
import sqlalchemy as sa

revision = "6a8f19d0b2c7"
down_revision = "e8b4c0a6d213"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("public_organizers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("competitions") as batch:
        batch.add_column(sa.Column("public_organizer_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_competitions_public_organizer", "public_organizers", ["public_organizer_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_competitions_public_organizer_id", ["public_organizer_id"])


def downgrade():
    with op.batch_alter_table("competitions") as batch:
        batch.drop_index("ix_competitions_public_organizer_id")
        batch.drop_constraint("fk_competitions_public_organizer", type_="foreignkey")
        batch.drop_column("public_organizer_id")
    op.drop_table("public_organizers")
