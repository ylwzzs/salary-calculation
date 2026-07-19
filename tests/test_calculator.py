from datetime import date
from decimal import Decimal
from salary_engine.calculator import compute
from salary_engine.rates import seed_rate_table
from salary_engine.models import Product, RateTable, SalesLine, Store


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


def test_per_store_achievement_cross_store(products):
    # 高睿 6/1 福景店(A,目标30000)、6/2 魅力之城店(B,目标60000)，各卖1500。
    # 按「人×店」分别算：两个店各自一个达成档，提成分别算后相加。
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
    # 福景店：目标30000/30×1=1000，业绩1500 → 150% → GE_100；A低温高毛13% → 195
    assert r.breakdown[("高睿", "福景店")]["achievement"] == Decimal("1.5")
    assert r.breakdown[("高睿", "福景店")]["commission"] == Decimal("195")
    # 魅力之城店：目标60000/30×1=2000，业绩1500 → 75% → 70_80；B低温高毛11% → 165
    assert r.breakdown[("高睿", "魅力之城店")]["bucket"] == "70_80"
    assert r.breakdown[("高睿", "魅力之城店")]["commission"] == Decimal("165")
    # 个人合计 = 195 + 165 = 360
    assert r.commission_by_person["高睿"] == Decimal("360")


def test_per_store_achievement_multi_day_same_store(products, stores):
    # 同一人在福景店干两天：同店多天合并算这一个店的达成档
    target = {"福景店": Decimal("30000")}  # 日目标=1000
    sales = [
        SalesLine("R1", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                  Decimal(1), Decimal("2000"), Decimal(3),
                  is_return=False, is_online=False, salesperson="高睿"),
        SalesLine("R2", None, "福景店", date(2026, 6, 2), "6920001", "奶",
                  Decimal(1), Decimal("200"), Decimal(3),
                  is_return=False, is_online=False, salesperson="高睿"),
    ]
    r = compute(sales, products, stores, target, seed_rate_table(),
                month="2026-06", days=30)
    # 福景店两天：目标1000×2=2000，业绩2200 → 110% → GE_100
    assert r.breakdown[("高睿", "福景店")]["achievement"] == Decimal("1.1")
    # 2200 × A类低温高毛13% = 286
    assert r.commission_by_person["高睿"] == Decimal("286")


def _sl(receipt, store, d, amount, sp="高睿", barcode="B1"):
    return SalesLine(receipt=receipt, src_order=None, store=store, sale_date=d,
                     barcode=barcode, product_name="奶", qty=1, amount=Decimal(amount),
                     unit_price=Decimal(amount), is_return=False, is_online=False,
                     cashier="", salesperson=sp)


def test_c3_duty_days_count_zero_sales_day():
    # C3：当班天数应取自当班表（含零销售当班日），而非『有销售的天数』。
    # 本用例为审计反例：6/2 当班但零销售 → 必须计入目标，否则达成率虚高。
    products = {"B1": Product("B1", "奶", "", "常温奶", Decimal(5), False)}
    stores = {"福景店": Store("福景店", "1组", "A", "")}
    targets = {"福景店": Decimal(3000)}
    rate_table = RateTable(version=1, effective_from=date(2026, 6, 1), rates={
        ("A", "GE_100", "常温高毛"): Decimal("0.13"),
        ("A", "LT_70", "常温高毛"): Decimal("0.09"),
    })
    sales = [_sl("R1", "福景店", date(2026, 6, 1), 100)]   # 仅 6/1 有销售
    # 当班表：高睿 6/1 与 6/2 都当班（6/2 零销售）
    duty = {("福景店", date(2026, 6, 1)): "高睿", ("福景店", date(2026, 6, 2)): "高睿"}
    res = compute(sales, products, stores, targets, rate_table, "2026-06", 30, duty_override=duty)
    bd = res.breakdown[("高睿", "福景店")]
    # 正确：目标=3000/30*2=200，达成=100/200=0.5 → LT_70
    assert bd["target"] == Decimal(200), f"target={bd['target']}"
    assert bd["bucket"] == "LT_70", f"bucket={bd['bucket']}"


def test_per_line_detail_rows_sum_to_total():
    products = {"B1": Product("B1", "奶", "", "常温奶", Decimal(5), False)}
    stores = {"S": Store("S", "1组", "A", "")}
    targets = {"S": Decimal(1000)}
    rt = RateTable(version=1, effective_from=date(2026, 6, 1),
                   rates={("A", "GE_100", "常温高毛"): Decimal("0.13")})
    sales = [
        _sl("R1", "S", date(2026, 6, 1), 60),
        _sl("R1", "S", date(2026, 6, 1), 40),
        SalesLine(receipt="R2", src_order="R1", store="S", sale_date=date(2026, 6, 1),
                  barcode="B1", product_name="奶", qty=1, amount=Decimal(-10),
                  unit_price=Decimal(10), is_return=True, is_online=False,
                  cashier="", salesperson="高睿"),
    ]
    duty = {("S", date(2026, 6, 1)): "高睿"}
    res = compute(sales, products, stores, targets, rt, "2026-06", 30, duty_override=duty)
    # 逐行：60×.13 + 40×.13 + (-10)×.13 = 11.70
    assert sum((d.commission for d in res.details), Decimal(0)) == Decimal("11.70")
    assert res.commission_by_person["高睿"] == Decimal("11.70")
    # 匹配退货行带 退货冲抵 标签
    assert any(d.tag == "退货冲抵" and d.amount == Decimal(-10) for d in res.details)


def test_excluded_lines_emit_zero_commission_detailrows():
    products = {"B1": Product("B1", "奶", "", "常温奶", Decimal(5), False),
                "B2": Product("B2", "非奶", "", "常温奶", Decimal(5), True)}  # exclude_commission
    stores = {"S": Store("S", "1组", "A", "")}
    targets = {"S": Decimal(1000)}
    rt = RateTable(version=1, effective_from=date(2026, 6, 1),
                   rates={("A", "GE_100", "常温高毛"): Decimal("0.13")})
    sales = [
        _sl("R1", "S", date(2026, 6, 1), 100),                       # 有效
        _sl("R2", "S", date(2026, 6, 1), 20, barcode="B2"),           # 不计提成
        _sl("R3", "S", date(2026, 6, 1), 30, barcode="B9"),           # 非乳品（B9 不在 products）
    ]
    gift_keys = {("R4", "B1")}
    sales.append(_sl("R4", "S", date(2026, 6, 1), 50))               # 赠送
    duty = {("S", date(2026, 6, 1)): "高睿"}
    res = compute(sales, products, stores, targets, rt, "2026-06", 30,
                  gift_keys=gift_keys, duty_override=duty)
    tags = {d.tag for d in res.details}
    assert {"有效计提", "不计提成", "非乳品", "赠送剔除"} <= tags
    # 剔除行 0 提成
    assert all(d.commission == 0 for d in res.details
               if d.tag in ("不计提成", "非乳品", "赠送剔除"))
    # 不变量：逐行全覆盖入参
    assert len(res.details) == len(sales)
    # 总额仅来自有效计提
    assert sum((d.commission for d in res.details), Decimal(0)) == Decimal("13.00")
