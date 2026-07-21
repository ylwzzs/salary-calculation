"""提成比例表：种子数据、达成率分档、3维查表（规格 §2.2）。

种子比例按制度文档图片原值逐格录入（用户要求『按表格执行、不推规律』，
不得用 A+offset 之类的规律推断——D 类低达成档不服从等差）。
每格顺序：[低温低毛, 低温高毛, 常温低毛, 常温高毛, 特价]，特价恒 1%。
"""
from datetime import date
from decimal import Decimal

from salary_engine.models import RateTable

_TIERS = ["低温低毛", "低温高毛", "常温低毛", "常温高毛", "特价"]
_BUCKETS = ["GE_100", "90_100", "80_90", "70_80", "LT_70"]

# 每个类别 × 达成率档 → [低温低毛, 低温高毛, 常温低毛, 常温高毛, 特价] 的比例(%)，
# 全部按制度文档图片原值逐格录入。
_RATES = {
    "A": {"GE_100": [9, 13, 7, 12, 1], "90_100": [8, 12, 6, 11, 1],
          "80_90": [7, 11, 5, 10, 1], "70_80": [6, 10, 4, 9, 1], "LT_70": [5, 9, 3, 8, 1]},
    "B": {"GE_100": [10, 14, 8, 13, 1], "90_100": [9, 13, 7, 12, 1],
          "80_90": [8, 12, 6, 11, 1], "70_80": [7, 11, 5, 10, 1], "LT_70": [6, 10, 4, 9, 1]},
    "C": {"GE_100": [11, 15, 9, 14, 1], "90_100": [10, 14, 8, 13, 1],
          "80_90": [9, 13, 7, 12, 1], "70_80": [8, 12, 6, 11, 1], "LT_70": [7, 11, 5, 10, 1]},
    "D": {"GE_100": [12, 16, 10, 15, 1], "90_100": [12, 16, 10, 15, 1],
          "80_90": [11, 15, 9, 14, 1], "70_80": [10, 14, 8, 13, 1], "LT_70": [9, 13, 7, 12, 1]},
}


def seed_rate_table(version: int = 1, effective_from: date = date(2026, 6, 1)) -> RateTable:
    """种子比例表（图片原值逐格录入，不推规律）。
    注：D 类 90~100 档图片原值与 100 档相同，待制单最终确认。"""
    rates = {}
    for cls, by_bucket in _RATES.items():
        for bucket, vals in by_bucket.items():
            for tier, val in zip(_TIERS, vals):
                rates[(cls, bucket, tier)] = Decimal(val) / Decimal(100)
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
    """3维查表。特价档固定 1%。

    缺格（自定义 RateTable 未填全）返回 0 不崩（H6，对齐 ADR-010 健壮性优先）：
    UI 误删一格比例 → 该格提成 0，而非整月 compute 因 KeyError 崩。
    """
    if product_tier == "特价":
        return Decimal("0.01")
    return table.rates.get((store_class, bucket, product_tier), Decimal(0))
