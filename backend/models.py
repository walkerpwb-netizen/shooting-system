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

    roles = Column(
        String,
        nullable=True,
    )

    is_active = Column(
        Integer,
        default=0,
    )

    activation_token = Column(
        String,
        nullable=True,
    )

    password_reset_token = Column(
        String,
        nullable=True,
    )

    password_reset_required = Column(
        Integer,
        default=0,
    )

    first_name = Column(
        String,
        nullable=True,
    )

    last_name = Column(
        String,
        nullable=True,
    )

    license_number = Column(
        String,
        nullable=True,
    )

    judge_license_number = Column(
        String,
        nullable=True,
    )

    club = Column(
        String,
        nullable=True,
    )

    birth_date = Column(
        String,
        nullable=True,
    )

    phone_number = Column(
        String,
        nullable=True,
    )

    last_seen = Column(
        String,
        nullable=True,
    )

    requested_role = Column(
        String,
        nullable=True,
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

    entry_fee = Column(
        String,
        nullable=True,
    )

    organizer_full_name = Column(
        String,
        nullable=True,
    )

    organizer_logo = Column(
        String,
        nullable=True,
    )

    sponsors = Column(
        String,
        nullable=True,
    )

    sponsor_logo = Column(
        String,
        nullable=True,
    )

    participant_limit = Column(
        Integer,
        nullable=True,
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

    ammo_type = Column(
        String,
        nullable=True,
    )

    ammo_price = Column(
        String,
        nullable=True,
    )

    entry_fee = Column(
        String,
        nullable=True,
    )


class CompetitionParticipant(Base):
    __tablename__ = "competition_participants"

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

    user_email = Column(
        String,
        nullable=False,
    )

    entry_type = Column(
        String,
        default="shooter",
    )

    is_head_judge = Column(
        Integer,
        default=0,
    )

    total_fee = Column(
        String,
        nullable=True,
    )


class ParticipantDiscipline(Base):
    __tablename__ = "participant_disciplines"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    participant_id = Column(
        Integer,
        ForeignKey("competition_participants.id"),
        nullable=False,
    )

    discipline_id = Column(
        Integer,
        ForeignKey("disciplines.id"),
        nullable=False,
    )

    ammo_type = Column(
        String,
        nullable=False,
    )


class JudgeInvitation(Base):
    __tablename__ = "judge_invitations"

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

    judge_email = Column(
        String,
        nullable=False,
    )

    discipline_id = Column(
        Integer,
        ForeignKey("disciplines.id"),
        nullable=True,
    )

    is_head_judge = Column(
        Integer,
        default=0,
    )


class DisciplineResult(Base):
    __tablename__ = "discipline_results"

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

    discipline_id = Column(
        Integer,
        ForeignKey("disciplines.id"),
        nullable=False,
    )

    participant_id = Column(
        Integer,
        ForeignKey("competition_participants.id"),
        nullable=False,
    )

    judge_email = Column(
        String,
        nullable=False,
    )

    points = Column(
        String,
        nullable=False,
    )
