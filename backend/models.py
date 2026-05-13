from sqlalchemy import Column, Integer, String, ForeignKey

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    email = Column(
        String,
        unique=True,
        index=True,
    )

    hashed_password = Column(
        String
    )

    role = Column(
        String,
        default="user",
    )


class Competition(Base):
    __tablename__ = "competitions"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    date = Column(
        String,
        nullable=False,
    )

    location = Column(
        String,
        nullable=False,
    )

    status = Column(
        String,
        default="draft",
    )

    created_by = Column(
        String,
        nullable=False,
    )


class Discipline(Base):
    __tablename__ = "disciplines"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    competition_id = Column(
        Integer,
        ForeignKey("competitions.id"),
        nullable=False,
    )

    name = Column(
        String,
        nullable=False,
    )

    description = Column(
        String,
        nullable=True,
    )

    scoring_type = Column(
        String,
        nullable=False,
    )

    shots_count = Column(
        Integer,
        nullable=False,
    )