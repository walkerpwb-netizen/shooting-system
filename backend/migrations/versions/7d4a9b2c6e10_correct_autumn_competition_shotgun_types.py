"""Correct the two misclassified shotgun disciplines in the autumn competition.

Revision ID: 7d4a9b2c6e10
Revises: 2a9e7c4d6b10
"""

from alembic import op
import sqlalchemy as sa


revision = "7d4a9b2c6e10"
down_revision = "2a9e7c4d6b10"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    competitions = sa.table(
        "competitions", sa.column("id"), sa.column("name"), sa.column("date"),
    )
    disciplines = sa.table(
        "disciplines", sa.column("id"), sa.column("competition_id"),
        sa.column("name"), sa.column("discipline_type"),
    )
    target_competition = sa.select(competitions.c.id).where(
        competitions.c.id == 143,
        competitions.c.name == "III WYSOKOGÓRSKI WIELOBÓJ JESIENNY",
        competitions.c.date == "2026-10-17",
    )
    corrected = connection.execute(
        disciplines.update().where(
            disciplines.c.competition_id.in_(target_competition),
            disciplines.c.discipline_type == "moving-target",
            sa.or_(
                sa.and_(disciplines.c.id == 316, disciplines.c.name == "STRZELBA STATYCZNA"),
                sa.and_(disciplines.c.id == 317, disciplines.c.name == "STRZELBA DYNAMICZNA"),
            ),
        ).values(discipline_type="shotgun")
    )
    if corrected.rowcount:
        # The next backend startup rebuilds rankings and trophies from the
        # corrected types. Recorded scores and scoring configuration stay intact.
        settings = sa.table("app_settings", sa.column("key"))
        connection.execute(settings.delete().where(
            settings.c.key == "competition_derived_cache_version",
        ))


def downgrade():
    # Preserve the corrected classification when rolling back application code.
    pass
