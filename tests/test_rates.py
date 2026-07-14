from datetime import date
from decimal import Decimal
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
