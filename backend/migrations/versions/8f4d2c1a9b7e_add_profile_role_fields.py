"""add profile role fields

Revision ID: 8f4d2c1a9b7e
Revises: ce68b3f1fcca
Create Date: 2026-05-31 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8f4d2c1a9b7e"
down_revision: Union[str, Sequence[str], None] = "ce68b3f1fcca"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("judge_license_number_key", sa.String(), nullable=True))
    op.add_column("users", sa.Column("judge_license_valid_until", sa.String(), nullable=True))
    op.add_column("users", sa.Column("no_club", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("no_license", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("voivodeship", sa.String(), nullable=True))
    op.add_column("users", sa.Column("organizer_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("organizer_name_key", sa.String(), nullable=True))

    op.execute("UPDATE users SET no_club = 0 WHERE no_club IS NULL")
    op.execute("UPDATE users SET no_license = 0 WHERE no_license IS NULL")

    op.create_index("ix_users_judge_license_number_key", "users", ["judge_license_number_key"], unique=True)
    op.create_index("ix_users_organizer_name_key", "users", ["organizer_name_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_organizer_name_key", table_name="users")
    op.drop_index("ix_users_judge_license_number_key", table_name="users")
    op.drop_column("users", "organizer_name_key")
    op.drop_column("users", "organizer_name")
    op.drop_column("users", "voivodeship")
    op.drop_column("users", "no_license")
    op.drop_column("users", "no_club")
    op.drop_column("users", "judge_license_valid_until")
    op.drop_column("users", "judge_license_number_key")
