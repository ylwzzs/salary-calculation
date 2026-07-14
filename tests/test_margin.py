from salary_engine.models import Product

def test_product_construct(products):
    assert products["6920001"].category == "低温奶"


from decimal import Decimal
from salary_engine.margin import gross_margin, classify_tier


def test_gross_margin_basic():
    assert gross_margin(Decimal(3), Decimal(2)) == Decimal("0.3333333333333333333333333333")


def test_gross_margin_zero_price():
    assert gross_margin(Decimal(0), Decimal(2)) == Decimal(0)


def test_classify_lowtemp_high_margin():
    # 低温奶 >15% → 低温高毛
    assert classify_tier("低温奶", Decimal("0.33")) == "低温高毛"


def test_classify_lowtemp_low_margin():
    # 低温奶 10%~15% → 低温低毛
    assert classify_tier("低温奶", Decimal("0.12")) == "低温低毛"
    assert classify_tier("低温奶", Decimal("0.15")) == "低温低毛"  # 恰好15%属低价档


def test_classify_lowtemp_special():
    # 低温奶 <=10%（含负）→ 特价
    assert classify_tier("低温奶", Decimal("0.10")) == "特价"
    assert classify_tier("低温奶", Decimal("-0.05")) == "特价"


def test_classify_roomtemp():
    assert classify_tier("常温奶", Decimal("0.18")) == "常温高毛"
    assert classify_tier("常温奶", Decimal("0.17")) == "常温低毛"  # 恰好17%属低价档
    assert classify_tier("常温奶", Decimal("0.10")) == "特价"  # 恰好10%属特价（规格 §2.3，与低温边界一致）
    assert classify_tier("常温奶", Decimal("0.09")) == "特价"
