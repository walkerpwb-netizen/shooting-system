"""Link competitions to the shooting range directory."""
from alembic import op
import sqlalchemy as sa

revision = "9f17c0a2b341"
down_revision = "6a8f19d0b2c7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("competitions", sa.Column("shooting_range_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_competitions_shooting_range_id", "competitions", "shooting_ranges", ["shooting_range_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_competitions_shooting_range_id", "competitions", ["shooting_range_id"])


def downgrade():
    op.drop_index("ix_competitions_shooting_range_id", table_name="competitions")
    op.drop_constraint("fk_competitions_shooting_range_id", "competitions", type_="foreignkey")
    op.drop_column("competitions", "shooting_range_id")
