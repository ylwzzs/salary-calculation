"""当班推断（规格 §2.5）：按 店×天 取线下销售额最多的营业员。"""
from collections import defaultdict
from datetime import date
from decimal import Decimal

from salary_engine.models import SalesLine


def infer_duty(sales_lines):
    """返回 {(store, date): salesperson | [多人民] }。
    仅统计线下销售（is_online=False）的金额；多人并列最高则返回 list。"""
    agg = defaultdict(lambda: defaultdict(Decimal))  # (store,date) -> {sp: amount}
    for ln in sales_lines:
        if ln.is_online or ln.is_return:
            continue
        agg[(ln.store, ln.sale_date)][ln.salesperson] += ln.amount
    duty = {}
    for key, by_sp in agg.items():
        top = max(by_sp.values())
        winners = [sp for sp, amt in by_sp.items() if amt == top]
        duty[key] = winners[0] if len(winners) == 1 else winners
    return duty
