from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, field_validator


class ProductOut(BaseModel):
    barcode: str
    name: Optional[str] = None
    spec: Optional[str] = None
    category: Optional[str] = None
    cost: Optional[float] = None
    exclude_commission: bool = False  # 不计入提成

    class Config:
        from_attributes = True


class ProductUpsert(BaseModel):
    barcode: str
    name: Optional[str] = None
    spec: Optional[str] = None
    category: Optional[str] = None
    cost: Optional[Decimal] = None
    exclude_commission: bool = False


class StoreOut(BaseModel):
    name: str
    group: Optional[str] = None
    store_class: Optional[str] = None
    supervisor: Optional[str] = None
    exclude_assessment: bool = False  # 不参与考核

    class Config:
        from_attributes = True


class StoreUpsert(BaseModel):
    name: str
    group: Optional[str] = None
    store_class: Optional[str] = None
    supervisor: Optional[str] = None
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
    items: List[TargetItem]


class MonthOut(BaseModel):
    month: str
    status: Optional[str] = None
    sales_file: Optional[str] = None
    gifts_file: Optional[str] = None
    rate_version_id: Optional[int] = None
    current_step: Optional[str] = None
    step_data: Optional[dict] = None

    class Config:
        from_attributes = True


class MonthCreate(BaseModel):
    month: str
    copy_from: Optional[str] = None


class SalaryPolicyContent(BaseModel):
    margin_rules: Dict[str, Any]
    commission_rates: Dict[str, Any]


class SalaryPolicyOut(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    created_at: Optional[str] = None
    created_by: Optional[str] = None
    content: SalaryPolicyContent
    note: Optional[str] = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _serialize_created_at(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value

    class Config:
        from_attributes = True


class SalaryPolicyCreate(BaseModel):
    effective_from: date
    note: Optional[str] = None
    content: SalaryPolicyContent


class SalaryPolicySummary(BaseModel):
    id: int
    version: int
    effective_from: date
    is_current: bool
    created_by: Optional[str] = None
    note: Optional[str] = None
    used_by_months: List[str] = []

    class Config:
        from_attributes = True


class AnomalyOut(BaseModel):
    id: int
    month: str
    anomaly_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    description: str
    status: str
    resolution: Optional[str] = None
    created_at: Optional[str] = None
    resolved_at: Optional[str] = None

    @field_validator("created_at", "resolved_at", mode="before")
    @classmethod
    def _serialize_datetime(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value

    class Config:
        from_attributes = True


class AnomalyResolve(BaseModel):
    resolution: Optional[str] = None
