from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from backend.app.db import Base, Product, Store, MonthlyTarget, RateVersion, Duty
from backend.app.services.engine_bridge import (
    rates_from_db, products_from_db, stores_from_db, targets_from_db,
    duty_override_from_db, days_in_month,
)


def _db():
    from sqlalchemy import create_engine
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return Session(eng)


def test_days_in_month():
    assert days_in_month("2026-06") == 30
    assert days_in_month("2024-02") == 29  # 闰年


def test_rates_roundtrip():
    s = _db()
    rt = {"A": {"GE_100": {"低温高毛": "0.13"}}}
    s.add(RateVersion(version=1, effective_from=date(2026, 6, 1), is_current=True, rates=rt))
    s.commit()
    table = rates_from_db(s)
    assert table.rates[("A", "GE_100", "低温高毛")] == Decimal("0.13")


def test_products_and_targets_bridge():
    s = _db()
    s.add(Product(barcode="6920001", name="低温奶", spec="200ml", category="低温奶", cost=2))
    s.add(Store(name="福景店", group="1组", store_class="A", supervisor="胡总"))
    s.add(MonthlyTarget(month="2026-06", store="福景店", target=84000))
    s.commit()
    p = products_from_db(s)
    assert p["6920001"].cost == 2 and p["6920001"].category == "低温奶"
    st = stores_from_db(s)
    assert st["福景店"].store_class == "A"
    tg = targets_from_db(s, "2026-06")
    assert tg["福景店"] == 84000


def test_duty_override_bridge():
    s = _db()
    s.add(Duty(month="2026-06", store="福景店", duty_date=date(2026, 6, 1), salesperson="高睿"))
    s.commit()
    ov = duty_override_from_db(s, "2026-06")
    assert ov[("福景店", date(2026, 6, 1))] == "高睿"


def test_sales_lines_from_db_carries_id():
    from backend.app.db import SessionLocal, SalesRecord
    from backend.app.services.engine_bridge import sales_lines_from_db
    from datetime import date
    db = SessionLocal()
    try:
        db.add(SalesRecord(month="2026-01", receipt="R1", store="S", sale_date=date(2026,1,1),
                           barcode="B", qty=1, amount=10, unit_price=10, salesperson="高睿",
                           cashier="", is_return=False, is_online=False, tag="有效"))
        db.commit()
        lines = sales_lines_from_db(db, "2026-01")
        assert len(lines) == 1
        assert lines[0].sales_record_id is not None
        assert lines[0].receipt == "R1"
    finally:
        db.query(SalesRecord).filter_by(receipt="R1").delete(); db.commit(); db.close()
