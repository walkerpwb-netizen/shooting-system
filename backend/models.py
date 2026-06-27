from sqlalchemy import Column, Index, Integer, String, ForeignKey, Text, UniqueConstraint

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

    password_reset_expires_at = Column(
        String,
        nullable=True,
    )

    password_reset_required = Column(
        Integer,
        default=0,
    )

    refresh_token_version = Column(
        Integer,
        default=0,
        nullable=False,
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

    license_uuid = Column(
        String,
        nullable=True,
    )

    license_club_code = Column(
        String,
        nullable=True,
    )

    judge_license_number = Column(
        String,
        nullable=True,
    )

    judge_license_number_key = Column(
        String,
        unique=True,
        index=True,
        nullable=True,
    )

    judge_license_valid_until = Column(
        String,
        nullable=True,
    )

    club = Column(
        String,
        nullable=True,
    )

    no_club = Column(
        Integer,
        default=0,
    )

    no_license = Column(
        Integer,
        default=0,
    )

    voivodeship = Column(
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

    organizer_name = Column(
        String,
        nullable=True,
    )

    organizer_name_key = Column(
        String,
        unique=True,
        index=True,
        nullable=True,
    )

    premium_until = Column(
        String,
        nullable=True,
    )

    premium_disabled = Column(
        Integer,
        default=0,
        nullable=False,
        server_default="0",
    )

    premium_organizer_disabled = Column(
        Integer,
        default=0,
        nullable=False,
        server_default="0",
    )

    profile_photo_url = Column(
        String,
        nullable=True,
    )

    account_type = Column(
        String,
        default="user",
        index=True,
    )

    pzss_club_short_name = Column(
        String,
        nullable=True,
    )

    pzss_club_full_name = Column(
        String,
        nullable=True,
    )

    pzss_club_license_number = Column(
        String,
        nullable=True,
    )

    pzss_club_status = Column(
        String,
        nullable=True,
        index=True,
    )

    verified_club_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    club_membership_status = Column(
        String,
        nullable=True,
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    key = Column(
        String,
        unique=True,
        index=True,
        nullable=False,
    )

    value = Column(
        String,
        nullable=False,
    )


class AdDailyStat(Base):
    __tablename__ = "ad_daily_stats"
    __table_args__ = (
        UniqueConstraint("date", "slot", "device", name="uq_ad_daily_stats_date_slot_device"),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    date = Column(
        String,
        nullable=False,
        index=True,
    )

    slot = Column(
        String,
        nullable=False,
        index=True,
    )

    device = Column(
        String,
        nullable=False,
        index=True,
    )

    impressions = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    clicks = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    updated_at = Column(
        String,
        nullable=True,
    )


class HomePost(Base):
    __tablename__ = "home_posts"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    description = Column(
        Text,
        nullable=False,
    )

    image_url = Column(
        String,
        nullable=False,
    )

    created_at = Column(
        String,
        nullable=False,
        index=True,
    )

    created_by = Column(
        String,
        nullable=False,
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

    pzss_license_calendar = Column(
        Integer,
        default=0,
        nullable=False,
        server_default="0",
    )

    requires_licensed_judge = Column(
        Integer,
        default=1,
        nullable=False,
        server_default="1",
    )

    status = Column(
        String,
        default="draft",
    )

    completed_at = Column(
        String,
        nullable=True,
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

    discipline_type = Column(
        String,
        nullable=False,
        default="",
        server_default="",
    )

    shots_count = Column(
        Integer,
        nullable=False,
    )

    trap_variant = Column(
        String,
        nullable=True,
    )

    trap_series_count = Column(
        Integer,
        nullable=True,
    )

    clay_variant = Column(
        String,
        nullable=True,
    )

    clay_series_count = Column(
        Integer,
        nullable=True,
    )

    ammo_type = Column(
        String,
        nullable=True,
    )

    ammo_price = Column(
        String,
        nullable=True,
    )

    clay_price = Column(
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

    club = Column(
        String,
        nullable=True,
    )

    birth_date = Column(
        String,
        nullable=True,
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

    checked_in = Column(
        Integer,
        default=0,
    )

    checked_in_at = Column(
        String,
        nullable=True,
    )

    paid = Column(
        Integer,
        default=0,
    )

    paid_at = Column(
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

    squad_group_number = Column(
        Integer,
        nullable=True,
    )

    squad_position = Column(
        Integer,
        nullable=True,
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

    result_data = Column(
        Text,
        nullable=True,
    )


class Achievement(Base):
    __tablename__ = "achievements"
    __table_args__ = (
        UniqueConstraint(
            "competition_id",
            "participant_id",
            "category_id",
            name="uq_achievements_competition_participant_category",
        ),
        Index(
            "ix_achievements_user_timeline",
            "user_email",
            "awarded_at",
            "competition_id",
            "place",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_email = Column(
        String,
        index=True,
        nullable=False,
    )

    competition_id = Column(
        Integer,
        ForeignKey("competitions.id"),
        nullable=False,
    )

    participant_id = Column(
        Integer,
        ForeignKey("competition_participants.id"),
        nullable=False,
    )

    category_id = Column(
        String,
        nullable=False,
    )

    category_name = Column(
        String,
        nullable=False,
    )

    badge_type = Column(
        String,
        nullable=False,
    )

    medal = Column(
        String,
        nullable=False,
    )

    place = Column(
        Integer,
        nullable=False,
    )

    points = Column(
        String,
        nullable=False,
    )

    historical_path = Column(
        String,
        nullable=False,
    )

    awarded_at = Column(
        String,
        nullable=False,
    )


class RankingEntry(Base):
    __tablename__ = "ranking_entries"
    __table_args__ = (
        UniqueConstraint(
            "scope",
            "voivodeship",
            "metric",
            "user_id",
            name="uq_ranking_entries_scope_metric_user",
        ),
        Index(
            "ix_ranking_entries_lookup",
            "scope",
            "voivodeship",
            "metric",
            "place",
        ),
    )

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    scope = Column(
        String,
        nullable=False,
    )

    voivodeship = Column(
        String,
        nullable=False,
        default="",
        server_default="",
    )

    metric = Column(
        String,
        nullable=False,
    )

    metric_label = Column(
        String,
        nullable=False,
    )

    place = Column(
        Integer,
        nullable=False,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    display_name = Column(
        String,
        nullable=False,
    )

    first_name = Column(
        String,
        nullable=True,
    )

    last_name = Column(
        String,
        nullable=True,
    )

    club = Column(
        String,
        nullable=True,
    )

    points = Column(
        String,
        nullable=False,
    )

    points_value = Column(
        String,
        nullable=False,
    )

    updated_at = Column(
        String,
        nullable=False,
    )
