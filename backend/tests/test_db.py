from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.app.db import Base, Product, Store, MonthlyTarget, RateVersion, User


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
