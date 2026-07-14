"""毛利率与商品档位判定（规格 §2.3）。"""
from decimal import Decimal

ROOM_TEMP_HIGH = Decimal("0.17")   # 常温高毛阈值：毛利率 > 17%
LOW_TEMP_HIGH = Decimal("0.15")    # 低温高毛阈值：毛利率 > 15%
LOW_TIER_FLOOR = Decimal("0.10")   # 低毛下限：>= 10%


def gross_margin(unit_price: Decimal, cost: Decimal) -> Decimal:
    """(成交单价 − 成本) ÷ 成交单价。单价为0返回0。"""
    if unit_price == 0:
        return Decimal(0)
    return (unit_price - cost) / unit_price


def classify_tier(category: str, margin: Decimal) -> str:
    """返回 '常温高毛'|'常温低毛'|'低温高毛'|'低温低毛'|'特价'。"""
    if margin <= LOW_TIER_FLOOR:
        return "特价"
    if category == "常温奶":
        return "常温高毛" if margin > ROOM_TEMP_HIGH else "常温低毛"
    if category == "低温奶":
        return "低温高毛" if margin > LOW_TEMP_HIGH else "低温低毛"
    raise ValueError(f"未知商品分类: {category}")
