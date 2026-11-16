"""Administrator-maintained shop directory, before public map publication."""

from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models import GunShop


class GunShopData(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=180)
    phone: str = Field(default="", max_length=60)
    website: str = Field(default="", max_length=300)
    address: str = Field(default="", max_length=500)
    latitude: float | None = Field(default=None, ge=48.5, le=55.2, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=13.5, le=24.6, allow_inf_nan=False)
    license_number: str = Field(default="", max_length=120)
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


def shop_details(shop):
    return {field: getattr(shop, field) for field in (
        "id", "name", "phone", "website", "address", "latitude", "longitude",
        "license_number", "license_source", "created_at", "updated_at", "updated_by",
    )}


def build_gun_shops_router(get_db, get_current_admin):
    router = APIRouter(prefix="/admin/gun-shops", tags=["Sklepy"])

    def find_shop(shop_id, db):
        shop = db.get(GunShop, shop_id)
        if shop is None:
            raise HTTPException(404, "Sklep nie istnieje")
        return shop

    @router.get("")
    def list_shops(admin=Depends(get_current_admin), db=Depends(get_db)):
        return [shop_details(shop) for shop in db.query(GunShop).order_by(GunShop.id).all()]

    @router.post("", status_code=201)
    def create_shop(data: GunShopData, admin=Depends(get_current_admin), db=Depends(get_db)):
        stamp = datetime.now(timezone.utc).isoformat()
        shop = GunShop(**data.model_dump(), created_at=stamp, updated_at=stamp, updated_by=admin.email)
        db.add(shop)
        db.commit()
        db.refresh(shop)
        return shop_details(shop)

    @router.put("/{shop_id}")
    def update_shop(shop_id: int, data: GunShopData, admin=Depends(get_current_admin), db=Depends(get_db)):
        shop = find_shop(shop_id, db)
        for field, value in data.model_dump().items():
            setattr(shop, field, value)
        shop.updated_at = datetime.now(timezone.utc).isoformat()
        shop.updated_by = admin.email
        db.commit()
        db.refresh(shop)
        return shop_details(shop)

    @router.delete("/{shop_id}")
    def delete_shop(shop_id: int, admin=Depends(get_current_admin), db=Depends(get_db)):
        shop = find_shop(shop_id, db)
        db.delete(shop)
        db.commit()
        return {"message": "Sklep usunięty", "id": shop_id}

    return router
