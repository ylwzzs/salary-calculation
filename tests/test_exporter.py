from decimal import Decimal
from salary_engine.exporter import to_salary_rows, to_detail_rows
from salary_engine.calculator import ComputeResult, DetailRow
from datetime import date


def test_salary_rows_sorted_by_commission():
    result = ComputeResult(commission_by_person={"高睿": Decimal("0.39"),
                                                 "张燕": Decimal("1.20")})
    rows = to_salary_rows(result)
    assert rows[0]["提成合计"] == Decimal("1.20")  # 按提成降序
    assert rows[1]["提成合计"] == Decimal("0.39")


def test_detail_flags_marked():
    d = DetailRow("金星店", date(2026, 6, 3), "张燕", "6920001", "奶", "特价",
                  "D", "80_90", Decimal("0.01"), Decimal("-3"), Decimal("-0.03"),
                  flag="退货未匹配")
    rows = to_detail_rows([d])
    assert rows[0]["标记"] == "退货未匹配"
