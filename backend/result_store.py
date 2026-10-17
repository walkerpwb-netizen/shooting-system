from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from models import DisciplineResult


def save_discipline_result(
    db, *, competition_id, discipline_id, participant_id, judge_email, points,
    result_data=None,
):
    """Insert or edit one result atomically; the caller owns the transaction."""
    insert = {
        "postgresql": postgres_insert,
        "sqlite": sqlite_insert,
    }[db.get_bind().dialect.name]
    statement = insert(DisciplineResult).values(
        competition_id=competition_id,
        discipline_id=discipline_id,
        participant_id=participant_id,
        judge_email=judge_email,
        points=points,
        result_data=result_data,
    )
    changes = {
        "points": statement.excluded.points,
        "judge_email": statement.excluded.judge_email,
    }
    # A plain points edit must not erase previously recorded shot details.
    if result_data is not None:
        changes["result_data"] = statement.excluded.result_data
    statement = statement.on_conflict_do_update(
        index_elements=["participant_id", "discipline_id"],
        set_=changes,
    ).returning(DisciplineResult)
    return db.scalars(statement, execution_options={"populate_existing": True}).one()
