from datetime import date
from decimal import Decimal
from salary_engine.calculator import compute
from salary_engine.rates import seed_rate_table
from salary_engine.models import SalesLine, Store


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


def test_person_monthly_achievement_cross_store(products):
    # 高睿 6/1 在福景店(A,目标30000)、6/2 在魅力之城店(B,目标60000)，各卖1500
    stores = {"福景店": Store("福景店", "1组", "A"),
              "魅力之城店": Store("魅力之城店", "2组", "B")}
    targets = {"福景店": Decimal("30000"), "魅力之城店": Decimal("60000")}
    sales = [
        SalesLine("R1", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                  Decimal(500), Decimal("1500"), Decimal(3),
                  is_return=False, is_online=False, salesperson="高睿"),
        SalesLine("R2", None, "魅力之城店", date(2026, 6, 2), "6920001", "奶",
                  Decimal(500), Decimal("1500"), Decimal(3),
                  is_return=False, is_online=False, salesperson="高睿"),
    ]
    r = compute(sales, products, stores, targets, seed_rate_table(),
                month="2026-06", days=30)
    # 个人目标 = 30000/30 + 60000/30 = 1000+2000 = 3000；业绩3000 → 达成率100%
    assert r.person_target["高睿"] == Decimal("3000")
    assert r.person_achievement["高睿"] == Decimal(1)
    # 两笔都用高睿的 GE_100 档，但门店类别不同：A低温高毛13%→195；B低温高毛14%→210；合计405
    assert r.commission_by_person["高睿"] == Decimal("405")


def test_person_monthly_bucket_shared_across_days(products, stores):
    # 同一人在福景店干两天：业绩合并算一个月度档，两天共用（非按天各算各的）
    target = {"福景店": Decimal("30000")}  # 日目标=1000
    sales = [
        # 6/1 卖2000（当天200%）、6/2 卖200（当天20%）；月度合计2200/月目标(2天×1000=2000)=110%→GE_100
        SalesLine("R1", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                  Decimal(1), Decimal("2000"), Decimal(3),
                  is_return=False, is_online=False, salesperson="高睿"),
        SalesLine("R2", None, "福景店", date(2026, 6, 2), "6920001", "奶",
                  Decimal(1), Decimal("200"), Decimal(3),
                  is_return=False, is_online=False, salesperson="高睿"),
    ]
    r = compute(sales, products, stores, target, seed_rate_table(),
                month="2026-06", days=30)
    # 月度目标=1000×2=2000；业绩2200→110%→GE_100；两天都按GE_100的A类低温高毛13%
    assert r.person_achievement["高睿"] == Decimal("1.1")
    # 2000×0.13 + 200×0.13 = 286
    assert r.commission_by_person["高睿"] == Decimal("286")
