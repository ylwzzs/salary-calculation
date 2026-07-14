from datetime import date
from decimal import Decimal
from salary_engine.onduty import infer_duty
from salary_engine.models import SalesLine


def line(store, d, sp, amt, online=False):
    return SalesLine("R", None, store, d, "6920001", "奶", Decimal(1),
                     amt, amt, is_return=False, is_online=online, salesperson=sp)


def test_single_person_picked():
    sales = [line("福景店", date(2026, 6, 1), "高睿", Decimal(10))]
    duty = infer_duty(sales)
    assert duty[("福景店", date(2026, 6, 1))] == "高睿"


def test_pick_offline_top_salesperson():
    # 当天线下：高睿卖30、张燕卖20 → 选高睿；线上挂在"线上人"名下不算
    d = date(2026, 6, 1)
    sales = [
        line("福景店", d, "高睿", Decimal(30)),
        line("福景店", d, "张燕", Decimal(20)),
        line("福景店", d, "线上人", Decimal(100), online=True),
    ]
    duty = infer_duty(sales)
    assert duty[("福景店", d)] == "高睿"


def test_multi_person_flagged():
    # 两人并列最高 → 返回多人标记供人工确认
    d = date(2026, 6, 2)
    sales = [line("金星店", d, "张燕", Decimal(20)),
             line("金星店", d, "王芳", Decimal(20))]
    duty = infer_duty(sales)
    val = duty[("金星店", d)]
    assert isinstance(val, list) and set(val) == {"张燕", "王芳"}
