"""Mark historical shotgun factors without changing recorded competition scores.

Revision ID: 6e3b8d2f9a41
Revises: e6a2c4f8b153
"""

from alembic import op
import sqlalchemy as sa


revision = "6e3b8d2f9a41"
down_revision = "e6a2c4f8b153"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    competitions = sa.table(
        "competitions", sa.column("id"), sa.column("name"), sa.column("date"),
    )
    disciplines = sa.table(
        "disciplines", sa.column("id"), sa.column("competition_id"),
        sa.column("name"), sa.column("discipline_type"), sa.column("scoring_type"),
    )
    target_competition = sa.select(competitions.c.id).where(
        competitions.c.id == 143,
        competitions.c.name == "III WYSOKOGÓRSKI WIELOBÓJ JESIENNY",
        competitions.c.date == "2026-10-17",
    )
    corrected = connection.execute(
        disciplines.update().where(
            disciplines.c.competition_id.in_(target_competition),
            disciplines.c.discipline_type == "shotgun",
            disciplines.c.scoring_type == "points",
            sa.or_(
                sa.and_(disciplines.c.id == 316, disciplines.c.name == "STRZELBA STATYCZNA"),
                sa.and_(disciplines.c.id == 317, disciplines.c.name == "STRZELBA DYNAMICZNA"),
            ),
        ).values(scoring_type="factor")
    )
    if corrected.rowcount:
        settings = sa.table("app_settings", sa.column("key"))
        connection.execute(settings.delete().where(
            settings.c.key == "competition_derived_cache_version",
        ))


def downgrade():
    # Keep the explicit scoring unit and original results on application rollback.
    pass
