from datetime import date
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


class RateVersionOut(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    rates: dict

    class Config:
        from_attributes = True


class RateVersionCreate(BaseModel):
    effective_from: date
    rates: dict


class TargetItem(BaseModel):
    store: str
    target: Decimal


class TargetBatch(BaseModel):
    items: list[TargetItem]
