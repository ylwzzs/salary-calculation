"""主数据导入服务：复用 salary_engine.importer 解析后 upsert 进 DB。"""
from typing import Optional
from sqlalchemy.orm import Session
from backend.app.db import Product, Store, MonthlyTarget


def upsert_products(db: Session, products: dict) -> int:
    """products: {barcode: salary_engine.models.Product}"""
    n = 0
    for bc, p in products.items():
        row = db.get(Product, bc)
        if row is None:
            row = Product(barcode=bc)
            db.add(row)
        row.name, row.spec, row.category, row.cost = p.name, p.spec, p.category, p.cost
        n += 1
    db.commit()
    return n


def upsert_stores(db: Session, stores: dict, targets: dict, month: Optional[str] = None) -> int:
    """stores: {name: Store}; targets: {name: Decimal}。targets 仅在 month 给出时写入。"""
    n = 0
    for name, s in stores.items():
        row = db.get(Store, name)
        if row is None:
            row = Store(name=name)
            db.add(row)
        row.group, row.store_class, row.supervisor = s.group, s.store_class, s.supervisor
        n += 1
    if month:
        for name, tgt in targets.items():
            row = db.query(MonthlyTarget).filter_by(month=month, store=name).first()
            if row is None:
                row = MonthlyTarget(month=month, store=name, target=tgt)
                db.add(row)
            else:
                row.target = tgt
    db.commit()
    return n
