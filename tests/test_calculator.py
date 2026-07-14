from datetime import date
from decimal import Decimal
from salary_engine.calculator import compute
from salary_engine.rates import seed_rate_table
from salary_engine.models import SalesLine


def test_basic_commission_lowtemp_highmargin_classA_full(stores, products):
    # 福景店(A) 6/1 低温高毛，达成100%档：比例13%；销售额3 → 提成0.39
    target = {"福景店": Decimal("3")}
    sales = [SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001",
                       "低温奶", Decimal(1), Decimal(3), Decimal(3),
                       is_return=False, is_online=False, salesperson="高睿")]
    result = compute(sales, products, stores, target,
                     seed_rate_table(), month="2026-06", days=30)
    assert result.commission_by_person["高睿"] == Decimal("0.39")
    assert result.warnings == []


def test_gift_excluded(products, stores):
    target = {"福景店": Decimal("3")}
    sales = [SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001",
                       "低温奶", Decimal(1), Decimal(3), Decimal(3),
                       False, False, "高睿")]
    gifts = {("R001", "6920001")}  # 这笔是赠送 → 剔除
    result = compute(sales, products, stores, target, seed_rate_table(),
                     month="2026-06", days=30, gift_keys=gifts)
    assert result.commission_by_person.get("高睿", Decimal(0)) == Decimal(0)


def test_return_precise_offset(products, stores):
    # 卖3元后退货3元（同源单号+条码）→ 净0，提成0
    target = {"福景店": Decimal("100")}
    sales = [
        SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                  Decimal(1), Decimal(3), Decimal(3), False, False, "高睿"),
        SalesLine("R002", "R001", "福景店", date(2026, 6, 2), "6920001", "奶",
                  Decimal(-1), Decimal(-3), Decimal(3), True, False, "高睿"),
    ]
    result = compute(sales, products, stores, target, seed_rate_table(),
                     month="2026-06", days=30)
    assert result.commission_by_person.get("高睿", Decimal(0)) == Decimal(0)
