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


class StoreOut(BaseModel):
    name: str
    group: str | None = None
    store_class: str | None = None
    supervisor: str | None = None

    class Config:
        from_attributes = True


class StoreUpsert(BaseModel):
    name: str
    group: str | None = None
    store_class: str | None = None
    supervisor: str | None = None


class BatchClassIn(BaseModel):
    group: str                 # 按组
    store_class: str           # 改成 A/B/C/D
