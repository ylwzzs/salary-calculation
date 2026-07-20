"""真实 6 月数据冒烟 + Σ 对账（T8.1）。

用 repo 根的真实 Excel 文件跑重构后的引擎：
- 不崩（loads + compute 完成）
- Σ 不变量：逐行 details 之和 == commission_by_person 之和
- breakdown 非空（人算出来了）
- 打印总额 / 人数 / 明细行数 / 标签分布 / 警告样本

NOTE（C3 影响面）：本测试用 infer_duty 推断当班表（duty_override=None），
而 C3 的修正是『当班天数取自当班表（含零销售当班日）』。infer_duty 只能从
有销售的（店×天）推出当班人，零销售当班日不会进入推断表 → 这些天的目标
不会被累加 → C3 的修正效果在真实数据上的完整体现，需要 Web 端确认后的
真实当班表（confirmed duty grid）才能复现，由用户在真实计算月份中复核。
"""
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from salary_engine.calculator import compute
from salary_engine.importer import (load_gift_keys_xlsx, load_products_xlsx,
                                    load_sales_xlsx, load_stores_xlsx)
from salary_engine.rates import seed_rate_table

# 真实文件位于 repo 根（tests/ 上一层）
REPO_ROOT = Path(__file__).resolve().parent.parent
SALES_X = REPO_ROOT / "6月历史销售流水_1_2072492017105887327(2).xlsx"
GIFTS_X = REPO_ROOT / "6月历史零售让利明细_1_2072492669747986432(1).xlsx"
INFO_X = REPO_ROOT / "商品信息表（常温低温）.xlsx"
COST_X = REPO_ROOT / "销售成本.xlsx"
STORES_X = REPO_ROOT / "分组.xlsx"
STORES_SHEET = "2026.6全部（正确）"

pytestmark = pytest.mark.realdata


@pytest.fixture(scope="module")
def real_inputs():
    """加载真实文件一次，整 module 复用。任一文件缺失则 skip。"""
    if not SALES_X.exists():
        pytest.skip(f"真实销售流水缺失: {SALES_X}")
    products = load_products_xlsx(str(INFO_X), str(COST_X))
    stores, targets = load_stores_xlsx(str(STORES_X), STORES_SHEET)
    gift_keys = load_gift_keys_xlsx(str(GIFTS_X))
    sales = load_sales_xlsx(str(SALES_X))
    return products, stores, targets, gift_keys, sales


def test_realdata_june_smoke_and_sigma(real_inputs, capsys):
    """真实 6 月数据：引擎能跑完 + Σ 不变量成立 + 结果非空。"""
    products, stores, targets, gift_keys, sales = real_inputs

    # ---- 1) 加载侧诊断（即便 compute 崩了，也能看到入参规模）----
    none_cat = sum(1 for p in products.values() if p.category is None)
    n_returns = sum(1 for s in sales if s.is_return)
    n_online = sum(1 for s in sales if s.is_online)
    print(f"[load] products={len(products)} (category=None: {none_cat})")
    print(f"[load] stores={len(stores)} targets={len(targets)} gift_keys={len(gift_keys)}")
    print(f"[load] sales={len(sales)} (returns={n_returns} online={n_online})")

    # ---- 2) 跑引擎（duty_override=None → 内部用 infer_duty）----
    result = compute(
        sales, products, stores, targets, seed_rate_table(),
        month="2026-06", days=30, gift_keys=gift_keys,
        # duty_override 留空：用 infer_duty。见模块 docstring 的 C3 NOTE。
    )

    # ---- 3) Σ 不变量：逐行 details 之和 == commission_by_person 之和 ----
    det_sum = sum((d.commission for d in result.details), Decimal(0))
    person_sum = sum(result.commission_by_person.values(), Decimal(0))
    assert det_sum == person_sum, (
        f"Σ 不变量失效: sum(details)={det_sum} != sum(by_person)={person_sum} "
        f"diff={det_sum - person_sum}"
    )

    # ---- 4) breakdown 非空（至少算出一些人）----
    assert result.breakdown, "breakdown 为空：未算出任何 人×店 组合"

    # ---- 5) 报表（不 assert，只打印供人工复核）----
    tag_counts = {}
    for d in result.details:
        tag_counts[d.tag] = tag_counts.get(d.tag, 0) + 1
    warn_types = {}
    for w in result.warnings:
        head = w.split(":", 1)[0].split("（", 1)[0].strip()
        warn_types[head] = warn_types.get(head, 0) + 1
    print(f"[result] total_commission={person_sum}")
    print(f"[result] #people={len(result.commission_by_person)}")
    print(f"[result] #detail_rows={len(result.details)}")
    print(f"[result] tag_breakdown={tag_counts}")
    print(f"[result] #warnings={len(result.warnings)} sample_types={dict(list(warn_types.items())[:10])}")
    # 缺分类样本（H1/ADR-010）：cost-only 条码，含信息表漏录的真乳品（数据归属人补）
    missing_cat = [w for w in result.warnings if w.startswith("缺分类")]
    print(f"[result] #缺分类={len(missing_cat)} samples:")
    for w in missing_cat[:30]:
        print(f"  - {w}")
    print(f"[result] sigma_check: sum(details)==sum(by_person)=={person_sum}  OK")
