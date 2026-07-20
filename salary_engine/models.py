"""核心数据类。"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class Product:
    barcode: str
    name: str
    spec: str
    category: str            # '常温奶' | '低温奶'
    cost: Optional[Decimal]  # 销售成本(单件)，匹配不到为 None
    exclude_commission: bool = False  # 不计入提成


@dataclass(frozen=True)
class Store:
    name: str
    group: str               # '1组' | '2组' | '3组'
    store_class: str         # 'A' | 'B' | 'C' | 'D'
    supervisor: str = ""


@dataclass(frozen=True)
class MonthlyTarget:
    month: str               # 'YYYY-MM'
    store: str
    target: Decimal


@dataclass
class SalesLine:
    receipt: str             # 小票单号
    src_order: Optional[str] # 源单号（退货用）
    store: str
    sale_date: date
    barcode: str
    product_name: str
    qty: Decimal
    amount: Decimal          # 销售金额，退货为负
    unit_price: Decimal
    is_return: bool          # 销售方式 == '退货'
    is_online: bool          # 订单渠道 == '线上'
    cashier: str = ""
    salesperson: str = ""    # 营业员名称
    sales_record_id: int = None  # 源 SalesRecord.id，物化反查用（T2.1）
    raw: dict = field(default_factory=dict)  # 源 Excel 全字段留底（台账对账用）


@dataclass(frozen=True)
class RateTable:
    version: int
    effective_from: date
    rates: dict              # {(store_class, ach_bucket, product_tier): Decimal 比例}
