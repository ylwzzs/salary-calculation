# 牛奶提成计算引擎 Implementation Plan (Plan 1 / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个独立的 Python 计算引擎，吃进当月销售/让利 Excel 与主数据，按业绩工资制度算出每个营业员的提成，导出工资表+明细 Excel。

**Architecture:** 纯 Python 包 `salary_engine`，分层：数据模型 → Excel 导入器 → 计算单元（毛利率/档位/达成率/查表/当班）→ 计算器主流程 → 导出器。CLI 把它们串起来跑端到端。本计划不含 Web（Plan 2/3 再包）。

**Tech Stack:** Python 3.10+、pandas、openpyxl、pytest。金额用 `decimal.Decimal`。

**对应规格：** `docs/superpowers/specs/2026-07-14-milk-commission-system-design.md`

---

## File Structure

```
salary_calculation/
├── pyproject.toml
├── salary_engine/
│   ├── __init__.py
│   ├── models.py          # 数据类：Product/Store/SalesLine/RateTable/MonthlyTarget
│   ├── rates.py           # 比例表种子 + 达成率分档 + 3维查表
│   ├── margin.py          # 毛利率 + 商品档位判定
│   ├── onduty.py          # 当班推断
│   ├── importer.py        # Excel 导入（商品/门店/销售/让利）
│   ├── calculator.py      # 提成计算主流程（剔除赠送/退货匹配/归属/算提成）
│   ├── exporter.py        # 导出工资表 + 明细 Excel
│   └── cli.py             # 端到端命令行入口
└── tests/
    ├── conftest.py        # 合成测试数据 fixtures
    ├── test_margin.py
    ├── test_rates.py
    ├── test_onduty.py
    ├── test_importer.py
    ├── test_calculator.py
    └── test_exporter.py
```

每个文件单一职责。导入、计算单元、主流程、导出各自独立可测。

---

## Task 1: 项目骨架

**Files:**
- Create: `pyproject.toml`
- Create: `salary_engine/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/test_smoke.py`

- [ ] **Step 1: 写 `pyproject.toml`**

```toml
[project]
name = "salary-engine"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = ["pandas>=2.0", "openpyxl>=3.1"]

[project.optional-dependencies]
dev = ["pytest>=7.0"]

[project.scripts]
salary-engine = "salary_engine.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: 建空包文件**

`salary_engine/__init__.py` 内容：`"""牛奶业绩提成计算引擎。"""`
`tests/__init__.py` 内容：空。

- [ ] **Step 3: 写冒烟测试 `tests/test_smoke.py`**

```python
def test_package_importable():
    import salary_engine
    assert salary_engine.__doc__
```

- [ ] **Step 4: 安装并运行测试**

Run: `pip install -e ".[dev]" && pytest -q`
Expected: `1 passed`

- [ ] **Step 5: 提交**

```bash
git add pyproject.toml salary_engine tests
git commit -m "feat: 项目骨架与测试配置"
```

---

## Task 2: 数据模型

**Files:**
- Create: `salary_engine/models.py`
- Create: `tests/conftest.py`
- Test: `tests/test_margin.py`（顺手验证可构造）

- [ ] **Step 1: 写 `salary_engine/models.py`**

```python
"""核心数据类。"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class Product:
    barcode: str
    name: str
    spec: str
    category: str            # '常温奶' | '低温奶'
    cost: Optional[Decimal]  # 销售成本(单件)，匹配不到为 None


@dataclass(frozen=True)
class Store:
    name: str
    group: str               # '1组' | '2组' | '3组'
    store_class: str         # 'A' | 'B' | 'C' | 'D'
    supervisor: str = ""


@dataclass(frozen=True)
class MonthlyTarget:
    month: str               # 'YYYY-MM'
    store: str
    target: Decimal


@dataclass
class SalesLine:
    receipt: str             # 小票单号
    src_order: Optional[str] # 源单号（退货用）
    store: str
    sale_date: date
    barcode: str
    product_name: str
    qty: Decimal
    amount: Decimal          # 销售金额，退货为负
    unit_price: Decimal
    is_return: bool          # 销售方式 == '退货'
    is_online: bool          # 订单渠道 == '线上'
    cashier: str = ""
    salesperson: str = ""    # 营业员名称


@dataclass(frozen=True)
class RateTable:
    version: int
    effective_from: date
    rates: dict              # {(store_class, ach_bucket, product_tier): Decimal 比例}
```

- [ ] **Step 2: 写 `tests/conftest.py` 公共 fixtures**

```python
import pytest
from datetime import date
from decimal import Decimal
from salary_engine.models import Product, Store, MonthlyTarget, SalesLine


@pytest.fixture
def products():
    return {
        "6920001": Product("6920001", "低温测试奶", "200ml", "低温奶", Decimal("2.0")),
        "6920002": Product("6920002", "常温测试奶", "1L", "常温奶", Decimal("5.0")),
    }


@pytest.fixture
def stores():
    return {"福景店": Store("福景店", "1组", "A", "胡总")}


@pytest.fixture
def milk_sale():
    # 低温奶，单价3，成本2 → 毛利率(3-2)/3=33% → 低温高毛；数量1，金额3
    return SalesLine("R001", None, "福景店", date(2026, 6, 1),
                     "6920001", "低温测试奶", Decimal(1), Decimal(3),
                     Decimal(3), is_return=False, is_online=False, salesperson="高睿")
```

- [ ] **Step 3: 写构造测试 `tests/test_margin.py`（先占位，Task 9 填）**

```python
from salary_engine.models import Product

def test_product_construct(products):
    assert products["6920001"].category == "低温奶"
```

- [ ] **Step 4: 运行**

Run: `pytest -q`
Expected: `2 passed`

- [ ] **Step 5: 提交**

```bash
git add salary_engine/models.py tests/conftest.py tests/test_margin.py
git commit -m "feat: 数据模型与测试 fixtures"
```

---

## Task 3: 毛利率与商品档位

**Files:**
- Create: `salary_engine/margin.py`
- Test: `tests/test_margin.py`

- [ ] **Step 1: 写失败测试 `tests/test_margin.py`（追加）**

```python
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
    assert classify_tier("常温奶", Decimal("0.10")) == "常温低毛"
    assert classify_tier("常温奶", Decimal("0.09")) == "特价"
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest tests/test_margin.py -q`
Expected: FAIL（`ModuleNotFoundError: salary_engine.margin`）

- [ ] **Step 3: 写实现 `salary_engine/margin.py`**

```python
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
```

- [ ] **Step 4: 运行验证通过**

Run: `pytest tests/test_margin.py -q`
Expected: PASS（全部通过）

- [ ] **Step 5: 提交**

```bash
git add salary_engine/margin.py tests/test_margin.py
git commit -m "feat: 毛利率计算与商品档位判定"
```

---

## Task 4: 比例表种子、达成率分档、3维查表

**Files:**
- Create: `salary_engine/rates.py`
- Test: `tests/test_rates.py`

- [ ] **Step 1: 写失败测试 `tests/test_rates.py`**

```python
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
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest tests/test_rates.py -q`
Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: 写实现 `salary_engine/rates.py`**

```python
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
```

- [ ] **Step 4: 运行验证通过**

Run: `pytest tests/test_rates.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add salary_engine/rates.py tests/test_rates.py
git commit -m "feat: 比例表种子、达成率分档、3维查表"
```

---

## Task 5: 当班推断

**Files:**
- Create: `salary_engine/onduty.py`
- Test: `tests/test_onduty.py`

- [ ] **Step 1: 写失败测试 `tests/test_onduty.py`**

```python
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
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest tests/test_onduty.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现 `salary_engine/onduty.py`**

```python
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
```

- [ ] **Step 4: 运行验证通过**

Run: `pytest tests/test_onduty.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add salary_engine/onduty.py tests/test_onduty.py
git commit -m "feat: 当班推断（线下销售额最多者）"
```

---

## Task 6: Excel 导入器（商品档案、门店、销售、让利）

**Files:**
- Create: `salary_engine/importer.py`
- Test: `tests/test_importer.py`

> 说明：导入器在表头前可能有标题行，故按"含关键字"定位真正的表头行。

- [ ] **Step 1: 写失败测试 `tests/test_importer.py`**

```python
from decimal import Decimal
from salary_engine.importer import load_products_from_rows, load_sales_from_rows


def test_load_products_merges_cost():
    # 商品信息表行 + 销售成本行（按条码合并）
    info_rows = [["6920001", "低温奶A", "200ml", "低温奶"]]
    cost_rows = [["6920001", "低温奶A（件）", "20"]]  # 按条码匹配成本
    products = load_products_from_rows(info_rows, cost_rows)
    assert products["6920001"].category == "低温奶"
    assert products["6920001"].cost == Decimal("20")


def test_load_products_missing_cost_is_none():
    info_rows = [["6920002", "常温奶B", "1L", "常温奶"]]
    products = load_products_from_rows(info_rows, [])
    assert products["6920002"].cost is None  # 无成本 → 计算时标记人工干预


def test_load_sales_flags_return_and_online():
    header = ["销售方式", "订单渠道", "小票单号", "源单号", "机构名称",
              "销售时间", "国际条码", "商品名称", "数量", "销售金额", "销售单价", "营业员名称"]
    rows = [
        ["销售", "线下", "R001", "", "福景店", "2026-06-01", "6920001", "奶", "1", "3", "3", "高睿"],
        ["退货", "线下", "R002", "R001", "福景店", "2026-06-02", "6920001", "奶", "-1", "-3", "3", "高睿"],
        ["销售", "线上", "R003", "", "福景店", "2026-06-01", "6920001", "奶", "1", "3", "3", "线上人"],
    ]
    lines = load_sales_from_rows([header] + rows)
    assert lines[0].is_return is False and lines[0].is_online is False
    assert lines[1].is_return is True and lines[1].amount == Decimal("-3")
    assert lines[2].is_online is True
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest tests/test_importer.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现 `salary_engine/importer.py`**

```python
"""Excel 导入器。提供 *_from_rows 版本便于单测（rows=含表头的二维列表），
以及 load_*_from_xlsx 包装 openpyxl 读真实文件。"""
from datetime import date, datetime
from decimal import Decimal

from salary_engine.models import Product, Store, MonthlyTarget, SalesLine


def _D(v) -> Decimal:
    return Decimal(0) if v in (None, "") else Decimal(str(v))


def _find_header(rows, keyword):
    for i, r in enumerate(rows):
        if any(str(c) and keyword in str(c) for c in r):
            return i, list(r)
    raise ValueError(f"找不到含『{keyword}』的表头行")


def load_products_from_rows(info_rows, cost_rows):
    """info_rows: 商品信息表（含表头）；cost_rows: 销售成本表（含表头）。按条码合并成本。"""
    _, h = _find_header(info_rows, "国际条码") if any("国际条码" in str(c) for r in info_rows for c in r) else (0, info_rows[0])
    hi = {str(c): i for i, c in enumerate(h)}
    bc_i, name_i, spec_i, cat_i = hi["国际条码"], hi["商品名称"], hi["规格"], hi["类别"]
    cost_map = {}
    if cost_rows:
        hc = {str(c): i for i, c in enumerate(cost_rows[0])}
        cbc, ccost = hc["商品条码"], hc["销售成本"]
        for r in cost_rows[1:]:
            cost_map[str(r[cbc])] = _D(r[ccost])
    products = {}
    for r in info_rows[1:]:
        if r[bc_i] in (None, ""):
            continue
        bc = str(r[bc_i])
        products[bc] = Product(bc, str(r[name_i]), str(r[spec_i]), str(r[cat_i]),
                               cost_map.get(bc))
    return products


def load_stores_from_rows(rows):
    """rows: 类似『2026.6全部』sheet，含 主管/类别/组别/名称/本月目标。"""
    h = None
    for r in rows:
        if any(str(c) == "类别" for c in r):
            h = list(r); break
    idx = {str(c): i for i, c in enumerate(h)}
    stores, targets = {}, {}
    month = ""
    for r in rows:
        if not r or r[idx["名称"]] in (None, ""):
            continue
        if str(r[idx["类别"]]) not in ("A", "B", "C", "D"):
            continue
        name = str(r[idx["名称"]])
        stores[name] = Store(name, str(r[idx["组别"]]), str(r[idx["类别"]]),
                             str(r[idx.get("主管", 0)] or ""))
        targets[name] = _D(r[idx["本月目标"]])
    return stores, targets


def _parse_date(s):
    s = str(s)
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    if isinstance(s, datetime):
        return s.date()
    raise ValueError(f"无法解析日期: {s}")


def load_sales_from_rows(rows):
    """rows: 销售流水（含表头），前几行可能是标题，按『序号/小票单号』定位表头。"""
    _, h = _find_header(rows, "小票单号")
    idx = {str(c): i for i, c in enumerate(rows[_find_header(rows, "小票单号")[0]])}
    g = lambda k: idx.get(k)
    lines = []
    for r in rows[_find_header(rows, "小票单号")[0] + 1:]:
        if r[g("序号")] in (None, ""):
            continue
        lines.append(SalesLine(
            receipt=str(r[g("小票单号")]),
            src_order=(str(r[g("源单号")]) if r[g("源单号")] not in (None, "") else None),
            store=str(r[g("机构名称")]).replace("[" + str(r[g("机构名称")]).split("[")[1:], "") if "[" in str(r[g("机构名称")]) else str(r[g("机构名称")]),
            sale_date=_parse_date(r[g("销售时间")]),
            barcode=str(r[g("国际条码")]),
            product_name=str(r[g("商品名称")]),
            qty=_D(r[g("数量")]),
            amount=_D(r[g("销售金额")]),
            unit_price=_D(r[g("销售单价")]),
            is_return=(str(r[g("销售方式")]) == "退货"),
            is_online=(str(r[g("订单渠道")]) == "线上"),
            salesperson=str(r[g("营业员名称")]) if g("营业员名称") is not None else "",
        ))
    return lines


def load_gift_keys_from_rows(rows):
    """让利明细（整份=赠送清单）→ {(订单号, 国际条码)} 集合。"""
    _, hi = _find_header(rows, "订单号")
    idx = {str(c): i for i, c in enumerate(rows[hi])}
    o, b = idx["订单号"], idx["国际条码"]
    keys = set()
    for r in rows[hi + 1:]:
        if r[o] in (None, ""):
            continue
        keys.add((str(r[o]), str(r[b])))
    return keys


# —— 真实 xlsx 包装（用 openpyxl 读整表为二维列表后调用上面的 *_from_rows）——
def _xlsx_rows(path, sheet=None):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb[wb.sheetnames[0]]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


def load_products_xlsx(info_path, cost_path):
    return load_products_from_rows(_xlsx_rows(info_path), _xlsx_rows(cost_path))


def load_stores_xlsx(path, sheet):
    return load_stores_from_rows(_xlsx_rows(path, sheet))


def load_sales_xlsx(path):
    return load_sales_from_rows(_xlsx_rows(path))


def load_gift_keys_xlsx(path):
    return load_gift_keys_from_rows(_xlsx_rows(path))
```

> 注意：门店名称在销售流水里常带 `[10026]` 编码前缀（如 `[10026]晓东村店（来思尔）`）。本实现用简单分支剥离 `[...]` 前缀以匹配门店档案。执行时若发现仍有不匹配，在导入校验报告里标出。

- [ ] **Step 4: 运行验证通过**

Run: `pytest tests/test_importer.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add salary_engine/importer.py tests/test_importer.py
git commit -m "feat: Excel 导入器（商品/门店/销售/让利）"
```

---

## Task 7: 提成计算主流程

**Files:**
- Create: `salary_engine/calculator.py`
- Test: `tests/test_calculator.py`

> 计算器组合前面所有单元。**精确匹配退货**冲抵原行；**不匹配退货**算到退货当日负数；**赠送**按 (单号,条码) 剔除；**非乳品**忽略；**缺成本/类别**记入 warnings。

- [ ] **Step 1: 写失败测试 `tests/test_calculator.py`**

```python
from datetime import date
from decimal import Decimal
from salary_engine.calculator import compute
from salary_engine.rates import seed_rate_table


def test_basic_commission_lowtemp_highmargin_classA_full(stores, products):
    # 福景店(A) 6/1 低温高毛，达成100%档：比例13%；销售额3 → 提成0.39
    target = {"福景店": Decimal("3")}  # 目标3，当天卖3 → 达成率100%
    from salary_engine.models import SalesLine
    sales = [SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001",
                       "低温奶", Decimal(1), Decimal(3), Decimal(3),
                       is_return=False, is_online=False, salesperson="高睿")]
    result = compute(sales, products, stores, target,
                     seed_rate_table(), month="2026-06", days=30)
    assert result.commission_by_person["高睿"] == Decimal("0.39")
    assert result.warnings == []


def test_gift_excluded(products, stores):
    from salary_engine.models import SalesLine
    target = {"福景店": Decimal("3")}
    sales = [SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001",
                       "低温奶", Decimal(1), Decimal(3), Decimal(3),
                       False, False, "高睿")]
    gifts = {("R001", "6920001")}  # 这笔是赠送 → 剔除
    result = compute(sales, products, stores, target, seed_rate_table(),
                     month="2026-06", days=30, gift_keys=gifts)
    assert result.commission_by_person.get("高睿", Decimal(0)) == Decimal(0)


def test_return_precise_offset(products, stores):
    # 卖3元后退货3元（同源单号+条码）→ 净0，提成0
    from salary_engine.models import SalesLine
    target = {"福景店": Decimal("100")}
    sales = [
        SalesLine("R001", None, "福景店", date(2026, 6, 1), "6920001", "奶",
                  Decimal(1), Decimal(3), Decimal(3), False, False, "高睿"),
        SalesLine("R002", "R001", "福景店", date(2026, 6, 2), "6920001", "奶",
                  Decimal(-1), Decimal(-3), Decimal(3), True, False, "高睿"),
    ]
    result = compute(sales, products, stores, target, seed_rate_table(),
                     month="2026-06", days=30)
    assert result.commission_by_person.get("高睿", Decimal(0)) == Decimal(0)
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest tests/test_calculator.py -q`
Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: 写实现 `salary_engine/calculator.py`**

```python
"""提成计算主流程（规格 §2、§3）。"""
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from salary_engine.margin import gross_margin, classify_tier
from salary_engine.rates import achievement_bucket, lookup_rate
from salary_engine.onduty import infer_duty
from salary_engine.models import SalesLine


def clean_store(name: str) -> str:
    """剥离销售流水门店名的 [10026] 前缀和 （来思尔） 供应商后缀，对齐门店档案。"""
    name = str(name)
    name = re.sub(r"^\[[^\]]*\]", "", name)      # 去 [10026] 前缀
    name = re.sub(r"（[^（）]*）$", "", name)      # 去结尾中文括号后缀
    name = re.sub(r"\([^()]*\)$", "", name)       # 去结尾英文括号后缀
    return name.strip()


@dataclass
class DetailRow:
    store: str
    sale_date: date
    salesperson: str
    barcode: str
    product_name: str
    tier: str
    store_class: str
    bucket: str
    rate: Decimal
    amount: Decimal
    commission: Decimal
    flag: str = ""   # "" | "退货未匹配" | "赠送未匹配"


@dataclass
class ComputeResult:
    details: list = field(default_factory=list)
    commission_by_person: dict = field(default_factory=dict)
    commission_by_store: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)


def compute(sales_lines, products, stores, targets, rate_table,
            month: str, days: int, gift_keys=None, duty_override=None):
    """主流程。返回 ComputeResult。

    - gift_keys: {(订单号, 条码)} 赠送集合，命中的销售行剔除。
    - duty_override: {(store,date): salesperson} 人工确认当班；为 None 则自动推断。
    """
    gift_keys = gift_keys or set()
    warnings = []

    # 1) 拆分：正常销售 / 退货；剔除赠送；跳过非乳品；同时清洗门店名
    sales, returns = [], []
    for ln in sales_lines:
        ln = SalesLine(ln.receipt, ln.src_order, clean_store(ln.store), ln.sale_date,
                       ln.barcode, ln.product_name, ln.qty, ln.amount, ln.unit_price,
                       ln.is_return, ln.is_online, ln.salesperson)
        if (ln.receipt, ln.barcode) in gift_keys:
            continue  # 赠送剔除
        if ln.barcode not in products:
            continue  # 非乳品
        (returns if ln.is_return else sales).append(ln)

    # 3) 退货精确匹配：src_order → 原销售 receipt + 同条码
    sales_by_receipt = defaultdict(list)
    for s in sales:
        sales_by_receipt[(s.receipt, s.barcode)].append(s)
    matched_returns, unmatched_returns = [], []
    for r in returns:
        origs = sales_by_receipt.get((r.src_order, r.barcode), [])
        if r.src_order and origs:
            matched_returns.append((r, origs[0]))
        else:
            unmatched_returns.append(r)

    # 4) 当班表（用已清洗门店名的线下销售推断；人工 override 由 Web 提供）
    duty = duty_override if duty_override is not None else infer_duty(sales)

    # 5) 门店×天的乳品销售额（用于达成率）：正常销售(扣精确退货) + 不匹配退货(负)
    daily_sales = defaultdict(Decimal)  # (store,date) -> amount
    offset_by_receipt = defaultdict(Decimal)
    for r, orig in matched_returns:
        offset_by_receipt[(orig.receipt, orig.barcode)] += r.amount
    for s in sales:
        net = s.amount + offset_by_receipt.get((s.receipt, s.barcode), Decimal(0))
        daily_sales[(s.store, s.sale_date)] += net
    for r in unmatched_returns:
        daily_sales[(r.store, r.sale_date)] += r.amount  # 负数

    # 6) 逐行算提成
    details = []
    comm_person = defaultdict(Decimal)
    comm_store = defaultdict(Decimal)

    # 正常销售行（扣精确退货后的净额）
    for s in sales:
        net = s.amount + offset_by_receipt.get((s.receipt, s.barcode), Decimal(0))
        if net == 0:
            continue
        product = products[s.barcode]
        if product.cost is None:
            warnings.append(f"缺成本: {s.barcode}")
            continue
        store_obj = stores.get(s.store)
        if store_obj is None:
            warnings.append(f"未知门店: {s.store}")
            continue
        margin = gross_margin(s.unit_price, product.cost)
        tier = classify_tier(product.category, margin)
        target = targets.get(s.store, Decimal(0))
        daily_target = (target / days) if target and days else Decimal(0)
        ach = (daily_sales[(s.store, s.sale_date)] / daily_target) if daily_target else Decimal(0)
        bucket = achievement_bucket(ach)
        rate = lookup_rate(rate_table, store_obj.store_class, bucket, tier)
        commission = net * rate
        sp = _resolve_duty(duty, s.store, s.sale_date, s.salesperson)
        details.append(DetailRow(s.store, s.sale_date, sp, s.barcode, s.product_name,
                                 tier, store_obj.store_class, bucket, rate, net, commission))
        comm_person[sp] += commission
        comm_store[s.store] += commission

    # 不匹配退货：算到退货当日，按当日档比例算负数，标黄
    for r in unmatched_returns:
        product = products[r.barcode]
        store_obj = stores.get(r.store)
        if store_obj is None or product.cost is None:
            warnings.append(f"退货异常(缺数据): {r.barcode} @ {r.store}")
            continue
        margin = gross_margin(r.unit_price, product.cost)
        tier = classify_tier(product.category, margin)
        target = targets.get(r.store, Decimal(0))
        daily_target = (target / days) if target and days else Decimal(0)
        ach = (daily_sales[(r.store, r.sale_date)] / daily_target) if daily_target else Decimal(0)
        rate = lookup_rate(rate_table, store_obj.store_class, achievement_bucket(ach), tier)
        commission = r.amount * rate  # amount 为负 → 提成负
        sp = _resolve_duty(duty, r.store, r.sale_date, r.salesperson)
        details.append(DetailRow(r.store, r.sale_date, sp, r.barcode, r.product_name,
                                 tier, store_obj.store_class, achievement_bucket(ach),
                                 rate, r.amount, commission, flag="退货未匹配"))
        comm_person[sp] += commission
        comm_store[r.store] += commission

    return ComputeResult(details=details,
                         commission_by_person=dict(comm_person),
                         commission_by_store=dict(comm_store),
                         warnings=warnings)


def _resolve_duty(duty, store, d, fallback):
    v = duty.get((store, d))
    if v is None:
        return fallback
    if isinstance(v, list):
        return fallback  # 多人当天：先用该行原营业员，UI 阶段再人工定
    return v
```

- [ ] **Step 4: 运行验证通过**

Run: `pytest tests/test_calculator.py -q`
Expected: PASS（3 个测试通过）

- [ ] **Step 5: 提交**

```bash
git add salary_engine/calculator.py tests/test_calculator.py
git commit -m "feat: 提成计算主流程（赠送剔除/退货精确冲抵/不匹配退货负数）"
```

---

## Task 8: 导出器（工资表 + 明细 Excel）

**Files:**
- Create: `salary_engine/exporter.py`
- Test: `tests/test_exporter.py`

- [ ] **Step 1: 写失败测试 `tests/test_exporter.py`**

```python
from decimal import Decimal
from salary_engine.exporter import to_salary_rows, to_detail_rows
from salary_engine.calculator import ComputeResult, DetailRow
from datetime import date


def test_salary_rows_sorted_by_store():
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
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest tests/test_exporter.py -q`
Expected: FAIL

- [ ] **Step 3: 写实现 `salary_engine/exporter.py`**

```python
"""导出工资表与明细（规格 §8 输出）。"""
from decimal import Decimal

from salary_engine.calculator import ComputeResult, DetailRow


def to_salary_rows(result: ComputeResult):
    """按营业员汇总，提成降序。"""
    rows = [{"营业员": sp, "提成合计": amt}
            for sp, amt in result.commission_by_person.items()]
    rows.sort(key=lambda r: r["提成合计"], reverse=True)
    return rows


def to_detail_rows(details):
    return [{
        "门店": d.store, "日期": d.sale_date, "营业员": d.salesperson,
        "条码": d.barcode, "商品": d.product_name, "档位": d.tier,
        "门店类别": d.store_class, "达成档": d.bucket,
        "比例": d.rate, "金额": d.amount, "提成": d.commission,
        "标记": d.flag,
    } for d in details]


def write_excel(result: ComputeResult, out_path: str):
    """用 openpyxl 写两个 sheet：工资表 + 明细。"""
    import openpyxl
    wb = openpyxl.Workbook()
    ws1 = wb.active
    ws1.title = "工资表"
    ws1.append(["营业员", "提成合计"])
    for r in to_salary_rows(result):
        ws1.append([r["营业员"], float(r["提成合计"])])
    ws2 = wb.create_sheet("提成明细")
    headers = ["门店", "日期", "营业员", "条码", "商品", "档位", "门店类别",
               "达成档", "比例", "金额", "提成", "标记"]
    ws2.append(headers)
    for r in to_detail_rows(result.details):
        ws2.append([r[h] for h in headers])
    wb.save(out_path)
```

- [ ] **Step 4: 运行验证通过**

Run: `pytest tests/test_exporter.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add salary_engine/exporter.py tests/test_exporter.py
git commit -m "feat: 导出工资表与明细 Excel"
```

---

## Task 9: CLI 端到端 + 集成冒烟测试 + README

**Files:**
- Create: `salary_engine/cli.py`
- Create: `tests/test_cli_integration.py`
- Create: `README.md`

- [ ] **Step 1: 写 `salary_engine/cli.py`**

```python
"""端到端 CLI：salary-engine run --sales X --gifts Y --products-info P --cost C --stores-file S --stores-sheet SH --month 2026-06 --days 30 --out 工资表.xlsx"""
import argparse
import sys

from salary_engine.importer import (load_products_xlsx, load_stores_xlsx,
                                    load_sales_xlsx, load_gift_keys_xlsx)
from salary_engine.rates import seed_rate_table
from salary_engine.calculator import compute
from salary_engine.exporter import write_excel


def main(argv=None):
    p = argparse.ArgumentParser(prog="salary-engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--sales", required=True)
    run.add_argument("--gifts", required=True)
    run.add_argument("--products-info", required=True)
    run.add_argument("--cost", required=True)
    run.add_argument("--stores-file", required=True)
    run.add_argument("--stores-sheet", required=True)
    run.add_argument("--month", required=True)
    run.add_argument("--days", type=int, required=True)
    run.add_argument("--out", default="工资表.xlsx")
    args = p.parse_args(argv)

    products = load_products_xlsx(args.products_info, args.cost)
    stores, targets = load_stores_xlsx(args.stores_file, args.stores_sheet)
    sales = load_sales_xlsx(args.sales)
    gifts = load_gift_keys_xlsx(args.gifts)
    result = compute(sales, products, stores, targets, seed_rate_table(),
                     month=args.month, days=args.days, gift_keys=gifts)
    write_excel(result, args.out)
    print(f"已生成 {args.out}；明细 {len(result.details)} 行；"
          f"{len(result.warnings)} 条预警")
    for w in result.warnings[:20]:
        print("  ⚠️", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: 写集成冒烟测试 `tests/test_cli_integration.py`**

```python
import os
from datetime import date
from decimal import Decimal
from salary_engine.cli import main
from salary_engine.importer import load_sales_xlsx


def test_cli_runs_on_synthetic_data(tmp_path, monkeypatch):
    # 用合成的小 xlsx 跑通整条链路，验证不崩、产出文件存在
    import openpyxl
    def write_ws(path, header, rows, sheet=None):
        wb = openpyxl.Workbook(); ws = wb.active
        if sheet: ws.title = sheet
        ws.append(header)
        for r in rows: ws.append(r)
        wb.save(path); return path

    info = write_ws(tmp_path / "info.xlsx",
                    ["国际条码", "商品名称", "规格", "类别"],
                    [["6920001", "低温奶", "200ml", "低温奶"]])
    cost = write_ws(tmp_path / "cost.xlsx",
                    ["商品条码", "商品名称", "销售成本"],
                    [["6920001", "低温奶（件）", "20"]])
    sales = write_ws(tmp_path / "sales.xlsx",
        ["序号", "机构名称", "小票单号", "销售时间", "上传时间", "销售方式", "商品编码",
         "收银员名称", "国际条码", "数量", "销售金额", "销售单价", "商品名称", "营业员名称",
         "订单渠道", "源单号"],
        [["1", "福景店", "R001", "2026-06-01 10:00", "", "销售", "", "高睿",
          "6920001", "1", "3", "3", "低温奶", "高睿", "线下", ""]])
    gifts = write_ws(tmp_path / "gifts.xlsx",
                     ["序号", "订单号", "国际条码", "商品名称"],
                     [["1", "NONE", "0000", "x"]])
    stores = tmp_path / "stores.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "cfg"
    ws.append(["主管", "类别", "组别", "名称", "本月目标"])
    ws.append(["胡总", "A", "1组", "福景店", 3])
    wb.save(stores)

    out = tmp_path / "工资表.xlsx"
    rc = main(["run", "--sales", str(sales), "--gifts", str(gifts),
               "--products-info", str(info), "--cost", str(cost),
               "--stores-file", str(stores), "--stores-sheet", "cfg",
               "--month", "2026-06", "--days", "30", "--out", str(out)])
    assert rc == 0
    assert os.path.exists(out)
```

- [ ] **Step 3: 运行全部测试**

Run: `pytest -q`
Expected: 全部 PASS

- [ ] **Step 4: 写 `README.md`（引擎用法 + 与6月手工对账说明）**

```markdown
# 牛奶提成计算引擎（Plan 1）

独立 Python 引擎，算牛奶业绩提成，导出工资表+明细。

## 安装
    pip install -e ".[dev]"

## 跑当月
    salary-engine run \
      --sales 6月历史销售流水.xlsx \
      --gifts 6月历史零售让利明细.xlsx \
      --products-info 商品信息表（常温低温）.xlsx \
      --cost 销售成本.xlsx \
      --stores-file 分组.xlsx --stores-sheet "2026.6全部（正确）" \
      --month 2026-06 --days 30 --out 工资表.xlsx

## 测试
    pytest -q

## 验收对账（关键）
跑完 2026年6月 后，把 `工资表` sheet 与手工 `分组.xlsx` 的结果逐人对账。
若金额不一致，优先排查：成本条码匹配、门店名前缀剥离、当班推断、退货匹配。
引擎会在 stdout 打印 warnings（缺成本/未知门店/退货异常）供定位。
```

- [ ] **Step 5: 用真实6月数据跑一次并人工对账**

Run:
```bash
salary-engine run \
  --sales "6月历史销售流水_1_2072492017105887327(2).xlsx" \
  --gifts "6月历史零售让利明细_1_2072492669747986432(1).xlsx" \
  --products-info "商品信息表（常温低温）.xlsx" \
  --cost "销售成本.xlsx" \
  --stores-file "分组.xlsx" --stores-sheet "2026.6全部（正确）" \
  --month 2026-06 --days 30 --out "工资表_2026-06.xlsx"
```
Expected: 生成 `工资表_2026-06.xlsx`，stdout 显示明细行数与预警。随后**人工**与手工结果逐人对账（引擎无法自动知道手工金额）。差异项回到对应单元排查。

- [ ] **Step 6: 提交**

```bash
git add salary_engine/cli.py tests/test_cli_integration.py README.md
git commit -m "feat: CLI 端到端 + 集成冒烟测试 + README"
```

---

## Self-Review（计划自审，已核对）

**1. 规格覆盖：** §2.1 提成公式(Task7) ✓｜§2.2 比例表与查表(Task4) ✓｜§2.3 毛利率与档位(Task3) ✓｜§2.4 达成率(Task7) ✓｜§2.5 当班(Task5) ✓｜§3 退货(Task7) ✓｜§3 赠送(Task6/7) ✓｜§3 线上归属(Task7,线上线下同店同天合并) ✓｜§3 非乳品(Task7) ✓｜§3 成本匹配(Task6,缺成本warning) ✓｜§3 缺目标(Task7 daily_target=0→ach=0) ✓｜§4 数据模型(Task2) ✓｜§8 输出(Task8) ✓。
**版本化比例表/门店批量改类/当班网格拖拽** 属于 Web（Plan 2/3），本引擎留接口（`duty_override`、`seed_rate_table(version)`），不在本计划实现。

**2. 占位扫描：** 无 TODO/TBD/死代码（自审中已清除 Task7 的 `emit` 占位函数、修正 `infer_duty` 入参与门店名清洗）。

**3. 类型一致：** `classify_tier` 返回的档位字符串与 `rates._TIERS`、`calculator` 用法一致；`achievement_bucket` 返回键与 `rates._BUCKETS`、calculator 用法一致；`DetailRow` 字段在 calculator 与 exporter 间一致。已核对。

---

## 执行交接

Plan 1 完成（计算引擎可独立跑、有测试、能用6月真实数据对账）后，再依次写：
- **Plan 2 · Web 后端**（FastAPI + SQLite + 账号密码登录 + API，复用本引擎）
- **Plan 3 · Web 前端**（React 四屏 UI，含当班网格拖拽、结果看板）
