from datetime import date
from decimal import Decimal

import pytest

from salary_engine.rates import achievement_bucket, lookup_rate, seed_rate_table


def test_buckets_boundaries():
    assert achievement_bucket(Decimal("1.00")) == "GE_100"
    assert achievement_bucket(Decimal("1.50")) == "GE_100"
    assert achievement_bucket(Decimal("0.9999")) == "90_100"
    assert achievement_bucket(Decimal("0.90")) == "90_100"
    assert achievement_bucket(Decimal("0.8999")) == "80_90"
    assert achievement_bucket(Decimal("0.80")) == "80_90"
    assert achievement_bucket(Decimal("0.70")) == "70_80"
    assert achievement_bucket(Decimal("0.69")) == "LT_70"
    assert achievement_bucket(Decimal(0)) == "LT_70"


def test_lookup_a_class_ge100():
    rt = seed_rate_table()
    # A类 100%档：低温低毛9/低温高毛13/常温低毛7/常温高毛12/特价1
    assert lookup_rate(rt, "A", "GE_100", "低温高毛") == Decimal("0.13")
    assert lookup_rate(rt, "A", "GE_100", "常温高毛") == Decimal("0.12")
    assert lookup_rate(rt, "A", "GE_100", "特价") == Decimal("0.01")


def test_lookup_d_class_anomaly():
    rt = seed_rate_table()
    # D类 100%档：低温高毛16
    assert lookup_rate(rt, "D", "GE_100", "低温高毛") == Decimal("0.16")
    # D类 90~100档 按图片原值与100档相同（待制单确认）
    assert lookup_rate(rt, "D", "90_100", "低温高毛") == Decimal("0.16")


# 图片原值独立校验表（与实现 _RATES 分离，防止『A+offset 规律推断』回归）
_EXPECTED = {
    "A": {"GE_100": [9, 13, 7, 12, 1], "90_100": [8, 12, 6, 11, 1],
          "80_90": [7, 11, 5, 10, 1], "70_80": [6, 10, 4, 9, 1], "LT_70": [5, 9, 3, 8, 1]},
    "B": {"GE_100": [10, 14, 8, 13, 1], "90_100": [9, 13, 7, 12, 1],
          "80_90": [8, 12, 6, 11, 1], "70_80": [7, 11, 5, 10, 1], "LT_70": [6, 10, 4, 9, 1]},
    "C": {"GE_100": [11, 15, 9, 14, 1], "90_100": [10, 14, 8, 13, 1],
          "80_90": [9, 13, 7, 12, 1], "70_80": [8, 12, 6, 11, 1], "LT_70": [7, 11, 5, 10, 1]},
    "D": {"GE_100": [12, 16, 10, 15, 1], "90_100": [12, 16, 10, 15, 1],
          "80_90": [11, 15, 9, 14, 1], "70_80": [10, 14, 8, 13, 1], "LT_70": [9, 13, 7, 12, 1]},
}
_TIERS = ["低温低毛", "低温高毛", "常温低毛", "常温高毛", "特价"]


@pytest.mark.parametrize("cls", list("ABCD"))
@pytest.mark.parametrize("bucket", ["GE_100", "90_100", "80_90", "70_80", "LT_70"])
def test_all_rate_cells_match_image(cls, bucket):
    """全部 20 格(类别×达成档) × 5 档位 = 100 个比例，逐个对图片原值。"""
    rt = seed_rate_table()
    for tier, pct in zip(_TIERS, _EXPECTED[cls][bucket]):
        assert lookup_rate(rt, cls, bucket, tier) == Decimal(pct) / Decimal(100), \
            f"{cls}/{bucket}/{tier} 应为 {pct}%"


def test_d_lower_buckets_not_following_offset_pattern():
    """回归：D 类低达成档不服从 A+3，防止规律推断复现。"""
    rt = seed_rate_table()
    assert lookup_rate(rt, "D", "80_90", "低温高毛") == Decimal("0.15")  # 非 14
    assert lookup_rate(rt, "D", "70_80", "低温高毛") == Decimal("0.14")  # 非 13
    assert lookup_rate(rt, "D", "LT_70", "低温高毛") == Decimal("0.13")  # 非 12
