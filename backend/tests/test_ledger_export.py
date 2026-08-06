from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from backend.app.services.ledger_export import build_summary_rows


def _result(person, store, sales, target, achievement, bucket, commission):
    return SimpleNamespace(
        person=person, store=store,
        sales=Decimal(sales), target=Decimal(target),
        achievement=Decimal(achievement), bucket=bucket,
        commission=Decimal(commission),
    )


def test_build_summary_rows_single_row():
    results = [_result("高睿", "福景店", "10", "1", "1", "GE_100", "1.4")]
    tier_rows = [
        {"person": "高睿", "store": "福景店", "tier": "低温高毛",
         "rate": Decimal("0.14"), "amount": Decimal("10"), "commission": Decimal("1.4")},
    ]
    store_map = {"福景店": SimpleNamespace(store_class="A")}
    target_map = {"福景店": Decimal("30")}
    duty_days_map = {("高睿", "福景店"): 1}

    rows = build_summary_rows(results, tier_rows, store_map, target_map, duty_days_map, 30)

    assert len(rows) == 1
    row = rows[0]
    # 前 11 列：人/店/类型/月目标/日目标/考勤/实际目标/销售/达标率/档位/提成
    assert row[:11] == [
        "高睿", "福景店", "A", 30.0, 1.0, 1, 1.0, 10.0, 100.0, "≥100%", 1.4,
    ]
    # 低温高毛 idx 17/18/19：销售 10、比例 14.0%、提成 1.4
    assert row[17] == 10.0
    assert row[18] == "14.0%"
    assert row[19] == 1.4
    # 其它档位为 0 / 空
    assert row[11] == 0.0 and row[13] == 0.0 and row[23] == 0.0


def test_build_summary_rows_orders_by_commission_desc():
    results = [
        _result("甲", "店1", "1", "1", "1", "GE_100", "2"),
        _result("乙", "店1", "1", "1", "1", "GE_100", "5"),
    ]
    rows = build_summary_rows(results, [], {}, {}, {}, 30)
    assert [r[0] for r in rows] == ["乙", "甲"]
