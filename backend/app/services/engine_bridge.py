"""DB 数据 → salary_engine 对象的桥接（计算前组装引擎入参）。"""
import calendar
from datetime import date
from decimal import Decimal

from salary_engine.models import Product, Store, RateTable, SalesLine
from backend.app.db import Product as ProductRow, Store as StoreRow
from backend.app.db import MonthlyTarget, RateVersion, Duty, SalesRecord


def days_in_month(month: str) -> int:
    y, m = map(int, month.split("-"))
    return calendar.monthrange(y, m)[1]


def rates_from_db(db, rate_version_id: int = None) -> RateTable:
    """加载费率表。指定rate_version_id则用锁定版本，否则用当前版本。"""
    if rate_version_id:
        rv = db.get(RateVersion, rate_version_id)
    else:
        rv = db.query(RateVersion).filter_by(is_current=True).first()
    if not rv:
        raise ValueError("费率表不存在")
    rates = {}
    for cls, by_bucket in (rv.rates or {}).items():
        for bucket, by_tier in by_bucket.items():
            for tier, pct in by_tier.items():
                rates[(cls, bucket, tier)] = Decimal(str(pct))
    return RateTable(version=rv.version, effective_from=rv.effective_from, rates=rates)


def products_from_db(db) -> dict:
    return {r.barcode: Product(r.barcode, r.name, r.spec, r.category,
                               Decimal(r.cost) if r.cost is not None else None,
                               bool(r.exclude_commission))
            for r in db.query(ProductRow).all()}


def stores_from_db(db) -> dict:
    return {r.name: Store(r.name, r.group, r.store_class, r.supervisor or "")
            for r in db.query(StoreRow).all()}


def targets_from_db(db, month: str) -> dict:
    return {r.store: Decimal(r.target)
            for r in db.query(MonthlyTarget).filter_by(month=month).all()}


def duty_override_from_db(db, month: str) -> dict:
    return {(r.store, r.duty_date): r.salesperson
            for r in db.query(Duty).filter_by(month=month).all()}


def sales_lines_from_db(db, month: str) -> list:
    """从 SalesRecord 构建 SalesLine（计算真值源），携带 sales_record_id。
    不过滤——把该月全部销售/退货行原样交给引擎；过滤（赠送/不计提成/非乳品）由引擎做。"""
    rows = db.query(SalesRecord).filter_by(month=month).all()
    out = []
    for r in rows:
        out.append(SalesLine(
            receipt=r.receipt, src_order=r.src_order, store=r.store, sale_date=r.sale_date,
            barcode=r.barcode, product_name=r.product_name or "", qty=r.qty, amount=r.amount,
            unit_price=r.unit_price, is_return=r.is_return, is_online=r.is_online,
            cashier=r.cashier or "", salesperson=r.salesperson or "",
            sales_record_id=r.id))
    return out
