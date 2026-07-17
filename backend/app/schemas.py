from datetime import date
from decimal import Decimal
from pydantic import BaseModel


class ProductOut(BaseModel):
    barcode: str
    name: str | None = None
    spec: str | None = None
    category: str | None = None
    cost: float | None = None
    exclude_commission: bool = False  # 不计入提成

    class Config:
        from_attributes = True


class ProductUpsert(BaseModel):
    barcode: str
    name: str | None = None
    spec: str | None = None
    category: str | None = None
    cost: Decimal | None = None
    exclude_commission: bool = False


class StoreOut(BaseModel):
    name: str
    group: str | None = None
    store_class: str | None = None
    supervisor: str | None = None
    exclude_assessment: bool = False  # 不参与考核

    class Config:
        from_attributes = True


class StoreUpsert(BaseModel):
    name: str
    group: str | None = None
    store_class: str | None = None
    supervisor: str | None = None
    exclude_assessment: bool = False


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


class MonthOut(BaseModel):
    month: str
    status: str | None = None
    sales_file: str | None = None
    gifts_file: str | None = None
    rate_version_id: int | None = None

    class Config:
        from_attributes = True


class MonthCreate(BaseModel):
    month: str
    copy_from: str | None = None


from typing import Dict, Any


class SalaryPolicyContent(BaseModel):
    margin_rules: Dict[str, Any]
    commission_rates: Dict[str, Any]


class SalaryPolicyOut(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    created_at: str
    created_by: str | None = None
    content: SalaryPolicyContent
    note: str | None = None

    class Config:
        from_attributes = True


class SalaryPolicyCreate(BaseModel):
    effective_from: date
    note: str | None = None
    content: SalaryPolicyContent


class SalaryPolicySummary(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    created_by: str | None = None
    note: str | None = None
    used_by_months: list[str] = []

    class Config:
        from_attributes = True
