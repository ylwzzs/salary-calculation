"""提成比例表：种子数据、达成率分档、3维查表（规格 §2.2）。"""
from datetime import date
from decimal import Decimal

from salary_engine.models import RateTable

# 顺序：[低温低毛, 低温高毛, 常温低毛, 常温高毛, 特价]
_BASE_A = {
    "GE_100": [9, 13, 7, 12, 1],
    "90_100": [8, 12, 6, 11, 1],
    "80_90":  [7, 11, 5, 10, 1],
    "70_80":  [6, 10, 4, 9, 1],
    "LT_70":  [5, 9, 3, 8, 1],
}
_TIERS = ["低温低毛", "低温高毛", "常温低毛", "常温高毛", "特价"]
_CLASSES = {"A": 0, "B": 1, "C": 2, "D": 3}
_BUCKETS = ["GE_100", "90_100", "80_90", "70_80", "LT_70"]


def seed_rate_table(version: int = 1, effective_from: date = date(2026, 6, 1)) -> RateTable:
    """从制度文档图片录入的种子比例表。B=A+1, C=A+2, D=A+3；
    D 类 90~100 档按图片原值（与 100 档相同，待制单确认）。"""
    rates = {}
    for cls, offset in _CLASSES.items():
        for bucket in _BUCKETS:
            base = _BASE_A[bucket]
            for i, tier in enumerate(_TIERS):
                if tier == "特价":
                    val = 1
                else:
                    val = base[i] + offset
                rates[(cls, bucket, tier)] = Decimal(val) / Decimal(100)
    # D 类 90~100 档异常修正（图片原值 = D 的 100 档值）
    for tier in ["低温低毛", "低温高毛", "常温低毛", "常温高毛"]:
        rates[("D", "90_100", tier)] = rates[("D", "GE_100", tier)]
    return RateTable(version=version, effective_from=effective_from, rates=rates)


def achievement_bucket(rate: Decimal) -> str:
    """达成率→档位键。左闭右开：[100%,+∞)/[90,100)/[80,90)/[70,80)/[0,70)。"""
    if rate >= Decimal(1):
        return "GE_100"
    if rate >= Decimal("0.90"):
        return "90_100"
    if rate >= Decimal("0.80"):
        return "80_90"
    if rate >= Decimal("0.70"):
        return "70_80"
    return "LT_70"


def lookup_rate(table: RateTable, store_class: str, bucket: str, product_tier: str) -> Decimal:
    """3维查表。特价档固定 1%。"""
    if product_tier == "特价":
        return Decimal("0.01")
    return table.rates[(store_class, bucket, product_tier)]
