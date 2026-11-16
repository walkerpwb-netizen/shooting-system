"""Moderated shop directory and public map data."""

from datetime import datetime, timezone
import hashlib
import re
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError

from models import GunShop, GunShopSubmission


class ShopDetailsData(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=180)
    phone: str = Field(default="", max_length=60)
    website: str = Field(default="", max_length=300)
    address: str = Field(default="", max_length=500)
    latitude: float | None = Field(default=None, ge=48.5, le=55.2, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=13.5, le=24.6, allow_inf_nan=False)
    license_source: str = Field(default="", max_length=500)

    @field_validator("website")
    @classmethod
    def validate_website(cls, value):
        if not value:
            return value
        if "://" not in value:
            value = f"https://{value}"
        try:
            parsed = urlsplit(value)
            valid = (parsed.scheme in {"http", "https"} and parsed.hostname
                     and not parsed.username and not parsed.password
                     and not any(character.isspace() for character in value)
                     and not any(character in value for character in "\\<>"))
            parsed.port
        except ValueError:
            valid = False
        if not valid or len(value) > 300:
            raise ValueError("Podaj poprawny adres strony WWW (HTTP lub HTTPS)")
        return value

    @model_validator(mode="after")
    def validate_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Podaj obie współrzędne albo pozostaw obie puste")
        return self


def require_contacts(values):
    if (not values["website"] or not 7 <= len(re.sub(r"\D", "", values["phone"])) <= 15
            or values["latitude"] is None or values["longitude"] is None):
        raise ValueError("Podaj telefon, stronę WWW i pełną lokalizację sklepu")


class GunShopData(ShopDetailsData):
    is_published: bool = False

    @model_validator(mode="after")
    def publication_ready(self):
        if self.is_published:
            require_contacts(self.model_dump())
        return self


class GunShopSubmissionData(ShopDetailsData):
    source_shop_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def submission_ready(self):
        require_contacts(self.model_dump())
        return self


DETAIL_FIELDS = tuple(ShopDetailsData.model_fields)


def shop_identity(values):
    if values["latitude"] is None or values["longitude"] is None:
        return None
    name = " ".join(values["name"].casefold().split())
    identity = f'{name}|{values["latitude"]:.6f}|{values["longitude"]:.6f}'
    return hashlib.sha256(identity.encode()).hexdigest()


def shop_details(shop):
    return {field: getattr(shop, field) for field in (
        "id", "name", "phone", "website", "address", "latitude", "longitude",
        "license_source", "is_published", "created_at", "updated_at", "updated_by",
    )}


def submission_details(submission):
    return {field: getattr(submission, field) for field in (*DETAIL_FIELDS,
        "id", "source_shop_id", "status", "submitted_by_email", "submitted_by_name",
        "created_at", "reviewed_at", "reviewed_by",
    )}


def commit_shop(db):
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Sklep o tej nazwie i lokalizacji już istnieje na liście") from error


def build_gun_shops_router(get_db, get_current_admin, get_current_user):
    router = APIRouter(tags=["Sklepy"])

    def find_shop(shop_id, db):
        shop = db.get(GunShop, shop_id)
        if shop is None:
            raise HTTPException(404, "Sklep nie istnieje")
        return shop

    @router.get("/admin/gun-shops")
    def list_shops(admin=Depends(get_current_admin), db=Depends(get_db)):
        return [shop_details(shop) for shop in db.query(GunShop).order_by(GunShop.id).all()]

    @router.post("/admin/gun-shops", status_code=201)
    def create_shop(data: GunShopData, admin=Depends(get_current_admin), db=Depends(get_db)):
        stamp = datetime.now(timezone.utc).isoformat()
        shop = GunShop(**data.model_dump(), identity_key=shop_identity(data.model_dump()),
                       created_at=stamp, updated_at=stamp, updated_by=admin.email)
        db.add(shop)
        commit_shop(db)
        db.refresh(shop)
        return shop_details(shop)

    @router.put("/admin/gun-shops/{shop_id}")
    def update_shop(shop_id: int, data: GunShopData, admin=Depends(get_current_admin), db=Depends(get_db)):
        shop = find_shop(shop_id, db)
        for field, value in data.model_dump().items():
            setattr(shop, field, value)
        shop.identity_key = shop_identity(data.model_dump())
        shop.updated_at = datetime.now(timezone.utc).isoformat()
        shop.updated_by = admin.email
        commit_shop(db)
        db.refresh(shop)
        return shop_details(shop)

    @router.delete("/admin/gun-shops/{shop_id}")
    def delete_shop(shop_id: int, admin=Depends(get_current_admin), db=Depends(get_db)):
        shop = find_shop(shop_id, db)
        db.delete(shop)
        db.commit()
        return {"message": "Sklep usunięty", "id": shop_id}

    @router.get("/gun-shops")
    def public_shops(db=Depends(get_db)):
        shops = db.query(GunShop).filter(GunShop.is_published.is_(True)).order_by(GunShop.id).all()
        return [{field: getattr(shop, field) for field in (
            "id", "name", "phone", "website", "address", "latitude", "longitude",
        )} for shop in shops]

    @router.post("/gun-shop-submissions", status_code=201)
    def submit_shop(data: GunShopSubmissionData, user=Depends(get_current_user), db=Depends(get_db)):
        if data.source_shop_id is not None:
            source = db.get(GunShop, data.source_shop_id)
            if source is None or not source.is_published:
                raise HTTPException(404, "Sklep nie istnieje na publicznej mapie")
        values = data.model_dump()
        submission = GunShopSubmission(**values, status="pending", created_at=datetime.now(timezone.utc).isoformat(),
            submitted_by_email=user.email,
            submitted_by_name=" ".join(filter(None, (getattr(user, "first_name", ""), getattr(user, "last_name", "")))) or user.email)
        db.add(submission)
        db.commit()
        db.refresh(submission)
        return submission_details(submission)

    @router.get("/admin/gun-shop-submissions")
    def list_submissions(admin=Depends(get_current_admin), db=Depends(get_db)):
        return [submission_details(entry) for entry in db.query(GunShopSubmission)
                .filter(GunShopSubmission.status != "approved").order_by(GunShopSubmission.id.desc()).all()]

    def find_submission(submission_id, db):
        entry = db.query(GunShopSubmission).filter_by(id=submission_id).with_for_update().first()
        if entry is None:
            raise HTTPException(404, "Zgłoszenie sklepu nie istnieje")
        return entry

    @router.put("/admin/gun-shop-submissions/{submission_id}")
    def edit_submission(submission_id: int, data: GunShopSubmissionData, admin=Depends(get_current_admin), db=Depends(get_db)):
        entry = find_submission(submission_id, db)
        if entry.status == "approved":
            raise HTTPException(409, "Zgłoszenie zostało już zatwierdzone. Edytuj sklep na liście.")
        if entry.source_shop_id != data.source_shop_id:
            raise HTTPException(409, "Nie można zmieniać sklepu, którego dotyczy zgłoszenie")
        for field in DETAIL_FIELDS:
            setattr(entry, field, getattr(data, field))
        entry.status = "pending"
        entry.reviewed_at = datetime.now(timezone.utc).isoformat()
        entry.reviewed_by = admin.email
        db.commit()
        db.refresh(entry)
        return submission_details(entry)

    @router.put("/admin/gun-shop-submissions/{submission_id}/approve")
    def approve_submission(submission_id: int, admin=Depends(get_current_admin), db=Depends(get_db)):
        entry = find_submission(submission_id, db)
        if entry.status == "approved":
            shop = db.get(GunShop, entry.approved_shop_id)
            if shop is None:
                raise HTTPException(409, "Zatwierdzony sklep został usunięty")
            return shop_details(shop)
        values = {field: getattr(entry, field) for field in DETAIL_FIELDS}
        shop = None
        if entry.source_shop_id is not None:
            shop = db.query(GunShop).filter_by(id=entry.source_shop_id).with_for_update().first()
            if shop is None:
                raise HTTPException(409, "Sklep wskazany w zgłoszeniu został usunięty. Nie utworzono nowego wpisu.")
            # Preserve the existing information source when a correction omits it.
            if not values["license_source"]:
                values["license_source"] = shop.license_source
        try:
            require_contacts(values)
        except ValueError as error:
            raise HTTPException(400, str(error)) from error
        stamp = datetime.now(timezone.utc).isoformat()
        if shop is not None:
            for field, value in values.items():
                setattr(shop, field, value)
            shop.is_published = True
            shop.identity_key = shop_identity(values)
            shop.updated_at = stamp
            shop.updated_by = admin.email
        else:
            shop = GunShop(**values, is_published=True, identity_key=shop_identity(values),
                           created_at=stamp, updated_at=stamp, updated_by=admin.email)
            db.add(shop)
        try:
            db.flush()
        except IntegrityError as error:
            db.rollback()
            raise HTTPException(409, "Sklep o tej nazwie i lokalizacji już istnieje na liście") from error
        entry.status = "approved"
        entry.approved_shop_id = shop.id
        entry.reviewed_at = stamp
        entry.reviewed_by = admin.email
        commit_shop(db)
        db.refresh(shop)
        return shop_details(shop)

    @router.put("/admin/gun-shop-submissions/{submission_id}/reject")
    def reject_submission(submission_id: int, admin=Depends(get_current_admin), db=Depends(get_db)):
        entry = find_submission(submission_id, db)
        if entry.status == "approved":
            raise HTTPException(409, "Zgłoszenie zostało już zatwierdzone")
        entry.status = "rejected"
        entry.reviewed_at = datetime.now(timezone.utc).isoformat()
        entry.reviewed_by = admin.email
        db.commit()
        db.refresh(entry)
        return submission_details(entry)

    return router
