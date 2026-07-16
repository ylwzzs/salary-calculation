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
