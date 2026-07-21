from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.app.db import Base, Product, Store, MonthlyTarget, User


def test_create_and_query_product():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    with Session(eng) as s:
        s.add(Product(barcode="6920001", name="低温奶", spec="200ml", category="低温奶", cost=2))
        s.commit()
        p = s.get(Product, "6920001")
        assert p.category == "低温奶" and p.cost == 2


def test_target_unique_month_store():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    with Session(eng) as s:
        s.add(MonthlyTarget(month="2026-06", store="福景店", target=84000))
        s.commit()


def test_wal_enabled():
    from backend.app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        mode = conn.execute(text("PRAGMA journal_mode")).scalar()
    assert str(mode).lower() == "wal"


def test_salesrecord_extra():
    from backend.app.db import SalesRecord, SessionLocal
    from datetime import date
    db = SessionLocal()
    try:
        r = SalesRecord(month="2026-01", receipt="R1", store="S", sale_date=date(2026,1,1),
                        barcode="B", qty=1, amount=10, unit_price=10, extra={"foo": "bar"})
        db.add(r); db.commit(); db.refresh(r)
        assert r.extra == {"foo": "bar"}
    finally:
        db.query(SalesRecord).filter_by(receipt="R1").delete(); db.commit(); db.close()


def test_detailrow_table():
    from backend.app.db import DetailRow, SessionLocal
    from datetime import date
    from decimal import Decimal
    db = SessionLocal()
    try:
        d = DetailRow(month="2026-01", sales_record_id=1, person="张三", store="S",
                      sale_date=date(2026,1,1), barcode="B", product_name="奶",
                      tier="常温高毛", bucket="GE_100", rate=Decimal("0.13"),
                      amount=Decimal(100), commission=Decimal("13.00"),
                      tag="有效计提", is_transferred=False)
        db.add(d); db.commit(); db.refresh(d)
        assert d.id and d.tag == "有效计提"
    finally:
        db.query(DetailRow).filter_by(person="张三").delete(); db.commit(); db.close()
