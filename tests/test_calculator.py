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
                  Decimal(1), Decimal(3), Decimal(3), is_return=False, is_online=False, salesperson="高睿"),
        SalesLine("R002", "R001", "福景店", date(2026, 6, 2), "6920001", "奶",
                  Decimal(-1), Decimal(-3), Decimal(3), is_return=True, is_online=False, salesperson="高睿"),
    ]
    result = compute(sales, products, stores, target, seed_rate_table(),
                     month="2026-06", days=30)
    assert result.commission_by_person.get("高睿", Decimal(0)) == Decimal(0)


def test_duplicate_receipt_barcode_return_offsets_group_once(products, stores):
    # 同(小票,条码)两笔销售各3元 + 一笔退货-3 → 净额3，退货只冲减一次（非把-3扣到两行）
    target = {"福景店": Decimal("100")}
    sales = [
        SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                  Decimal(1), Decimal(3), Decimal(3), is_return=False, is_online=False, salesperson="高睿"),
        SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                  Decimal(1), Decimal(3), Decimal(3), is_return=False, is_online=False, salesperson="高睿"),
        SalesLine("R002", "R001", "福景店", date(2026, 6, 2), "6920001", "奶",
                  Decimal(-1), Decimal(-3), Decimal(3), is_return=True, is_online=False, salesperson="高睿"),
    ]
    result = compute(sales, products, stores, target, seed_rate_table(),
                     month="2026-06", days=30)
    # 净额 = 3+3-3 = 3；目标100/30=3.33/天，当天3 → 达成率0.9 → 90_100档；A类低温高毛12% → 0.36
    assert result.commission_by_person["高睿"] == Decimal("0.36")


def test_missing_target_warns(products, stores):
    # 门店无月度目标 → 记 warning（供 Web 层标红阻断）
    sales = [SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                       Decimal(1), Decimal(3), Decimal(3), is_return=False, is_online=False, salesperson="高睿")]
    result = compute(sales, products, stores, {}, seed_rate_table(),
                     month="2026-06", days=30)
    assert any("缺月度目标" in w and "福景店" in w for w in result.warnings)
