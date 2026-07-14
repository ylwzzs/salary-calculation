import pytest
from datetime import date
from decimal import Decimal
from salary_engine.models import Product, Store, MonthlyTarget, SalesLine


@pytest.fixture
def products():
    return {
        "6920001": Product("6920001", "低温测试奶", "200ml", "低温奶", Decimal("2.0")),
        "6920002": Product("6920002", "常温测试奶", "1L", "常温奶", Decimal("5.0")),
    }


@pytest.fixture
def stores():
    return {"福景店": Store("福景店", "1组", "A", "胡总")}


@pytest.fixture
def milk_sale():
    # 低温奶，单价3，成本2 → 毛利率(3-2)/3=33% → 低温高毛；数量1，金额3
    return SalesLine("R001", None, "福景店", date(2026, 6, 1),
                     "6920001", "低温测试奶", Decimal(1), Decimal(3),
                     Decimal(3), is_return=False, is_online=False, salesperson="高睿")
