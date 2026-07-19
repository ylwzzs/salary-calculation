"""销售数据导入服务 - 落库时打标签"""
from datetime import date
from decimal import Decimal
from typing import List, Set, Tuple

from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from backend.app.db import SalesRecord, TransferRecord, Product, Store, MonthlyTarget
from salary_engine.models import SalesLine
from salary_engine.calculator import clean_store


def import_sales_to_db(
    db: Session,
    month: str,
    sales: List[SalesLine],
    gift_keys: Set[Tuple[str, str]],
) -> dict:
    """将销售数据导入数据库，同时打标签（upsert模式）

    Args:
        db: 数据库会话
        month: 月份 YYYY-MM
        sales: 销售记录列表
        gift_keys: 赠送匹配键集合 {(receipt, barcode), ...}

    Returns:
        {"total": int, "db_count": int}
    """
    # 获取商品信息（检查exclude_commission）
    products = {p.barcode: p for p in db.query(Product).all()}

    for s in sales:
        # 确定标签
        tag = _determine_tag(s, products, gift_keys)

        # 清洗门店名称
        cleaned_store = clean_store(s.store)

        # 使用 upsert 逻辑
        stmt = sqlite_insert(SalesRecord).values(
            month=month,
            receipt=s.receipt,
            src_order=s.src_order,
            store=cleaned_store,
            sale_date=s.sale_date,
            barcode=s.barcode,
            product_name=s.product_name,
            qty=s.qty,
            amount=s.amount,
            unit_price=s.unit_price,
            salesperson=s.salesperson,
            cashier=s.cashier,
            is_return=s.is_return,
            is_online=s.is_online,
            tag=tag,
            original_store=cleaned_store,
            original_date=s.sale_date,
        ).on_conflict_do_update(
            index_elements=["month", "receipt", "store", "sale_date", "barcode", "amount"],
            set_={
                "product_name": s.product_name,
                "qty": s.qty,
                "unit_price": s.unit_price,
                "salesperson": s.salesperson,
                "is_return": s.is_return,
                "is_online": s.is_online,
                "tag": tag,
            }
        )

        db.execute(stmt)

    db.commit()

    # 统计实际记录数
    actual_count = db.query(SalesRecord).filter(SalesRecord.month == month).count()
    return {"total": len(sales), "db_count": actual_count}


def _determine_tag(
    sales_line: SalesLine,
    products: dict,
    gift_keys: Set[Tuple[str, str]],
) -> str:
    """确定销售记录标签

    优先级：退款 > 赠送 > 不计提成 > 有效
    """
    # 1. 退款
    if sales_line.is_return:
        return "退款"

    # 2. 赠送（匹配让利明细）
    gift_key = (sales_line.receipt, sales_line.barcode)
    if gift_key in gift_keys:
        return "赠送"

    # 3. 不计提成（商品标记）
    product = products.get(sales_line.barcode)
    if product and product.exclude_commission:
        return "不计提成"

    # 4. 有效
    return "有效"


def transfer_sales(
    db: Session,
    month: str,
    salesperson: str,
    from_store: str,
    from_date: date,
    to_store: str,
    to_date: date,
    reason: str = None,
) -> int:
    """将某人某天的业绩转移到另一天/门店

    Args:
        db: 数据库会话
        month: 月份
        salesperson: 营业员
        from_store: 原门店
        from_date: 原日期
        to_store: 目标门店
        to_date: 目标日期
        reason: 调整原因

    Returns:
        转移记录数
    """
    # 查找要转移的记录
    records = db.query(SalesRecord).filter(
        SalesRecord.month == month,
        SalesRecord.store == from_store,
        SalesRecord.sale_date == from_date,
        SalesRecord.salesperson == salesperson,
    ).all()

    if not records:
        return 0

    # 记录转移历史
    transfer = TransferRecord(
        month=month,
        salesperson=salesperson,
        from_store=from_store,
        from_date=from_date,
        to_store=to_store,
        to_date=to_date,
        reason=reason,
    )
    db.add(transfer)

    # 更新记录
    for record in records:
        record.original_store = record.store
        record.original_date = record.sale_date
        record.store = to_store
        record.sale_date = to_date
        record.transfer_reason = reason or f"从{from_store}/{from_date}调整"

    db.commit()
    return len(records)
