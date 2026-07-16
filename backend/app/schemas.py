from decimal import Decimal
from pydantic import BaseModel


class ProductOut(BaseModel):
    barcode: str
    name: str | None = None
    spec: str | None = None
    category: str | None = None
    cost: Decimal | None = None

    class Config:
        from_attributes = True


class ProductUpsert(BaseModel):
    barcode: str
    name: str | None = None
    spec: str | None = None
    category: str | None = None
    cost: Decimal | None = None
