# Web 导出三 sheet（计算结果 + 台账 + 考勤排版）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/months/{month}/export` 从单 sheet 逐笔台账改为三 sheet（计算结果汇总 + 逐笔台账 + 考勤排版），全部读物化表零重算。

**Architecture:** `ledger_export.py` 提供三个纯函数（`build_summary_rows` / `build_duty_grid` / `write_salary_export`）；导出端点在现有逐笔 SQL 基础上增查 Result/Store/MonthlyTarget/Duty，组装后调新 writer。Sheet1 数据源 = Result 表（与页面同源）；5 档明细从已查逐笔行聚合（不加查询）。

**Tech Stack:** FastAPI / SQLAlchemy / openpyxl / pytest（venv: `.venv/bin/python -m pytest`）

## Global Constraints

- 零重算（ADR-002）：导出端点不得调用 `_run_compute`（现有测试 `test_export_reads_materialized_no_recompute` 守卫）。
- Sheet2 名称必须保留 `提成台账-{month}`（现有导出测试按名取值）。
- Sheet1 列序与 CLI `exporter.py` Sheet1 完全一致（26 列，见 spec）。
- 所有金额用 `Decimal` 聚合、`round(float(x), 2)` 落 Excel。
- 测试命令：`cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest <path> -v`

---

### Task 1: Sheet1 构建器 `build_summary_rows`

**Files:**
- Modify: `backend/app/services/ledger_export.py`（追加函数）
- Test: Create `backend/tests/test_ledger_export.py`

**Interfaces:**
- Consumes: `results` = list of `Result` ORM 行（属性 `person/store/sales/target/achievement/bucket/commission`）；`tier_rows` = list[dict]（键 `person/store/tier/rate/amount/commission`）；`store_map` = `{str: Store}`；`target_map` = `{str: Decimal}`；`duty_days_map` = `{(str,str): int}`；`days` = int
- Produces: `build_summary_rows(...) -> list[list]`，每行 26 列（Sheet1 完整一行）。排序：person 按 Σ 提成降序，店按提成降序。

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_ledger_export.py`：

```python
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from backend.app.services.ledger_export import build_summary_rows


def _result(person, store, sales, target, achievement, bucket, commission):
    return SimpleNamespace(
        person=person, store=store,
        sales=Decimal(sales), target=Decimal(target),
        achievement=Decimal(achievement), bucket=bucket,
        commission=Decimal(commission),
    )


def test_build_summary_rows_single_row():
    results = [_result("高睿", "福景店", "10", "1", "1", "GE_100", "1.4")]
    tier_rows = [
        {"person": "高睿", "store": "福景店", "tier": "低温高毛",
         "rate": Decimal("0.14"), "amount": Decimal("10"), "commission": Decimal("1.4")},
    ]
    store_map = {"福景店": SimpleNamespace(store_class="A")}
    target_map = {"福景店": Decimal("30")}
    duty_days_map = {("高睿", "福景店"): 1}

    rows = build_summary_rows(results, tier_rows, store_map, target_map, duty_days_map, 30)

    assert len(rows) == 1
    row = rows[0]
    # 前 11 列：人/店/类型/月目标/日目标/考勤/实际目标/销售/达标率/档位/提成
    assert row[:11] == [
        "高睿", "福景店", "A", 30.0, 1.0, 1, 1.0, 10.0, 100.0, "≥100%", 1.4,
    ]
    # 低温高毛 idx 17/18/19：销售 10、比例 14.0%、提成 1.4
    assert row[17] == 10.0
    assert row[18] == "14.0%"
    assert row[19] == 1.4
    # 其它档位为 0 / 空
    assert row[11] == 0.0 and row[13] == 0.0 and row[23] == 0.0


def test_build_summary_rows_orders_by_commission_desc():
    results = [
        _result("甲", "店1", "1", "1", "1", "GE_100", "2"),
        _result("乙", "店1", "1", "1", "1", "GE_100", "5"),
    ]
    rows = build_summary_rows(results, [], {}, {}, {}, 30)
    assert [r[0] for r in rows] == ["乙", "甲"]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_ledger_export.py -v`
Expected: FAIL — `ImportError: cannot import name 'build_summary_rows' from 'backend.app.services.ledger_export'`

- [ ] **Step 3: 实现 `build_summary_rows`**

在 `backend/app/services/ledger_export.py` 顶部加 `from salary_engine.exporter_helpers import _bucket_display`，并追加：

```python
_TIERS = ["常温高毛", "常温低毛", "低温高毛", "低温低毛", "特价"]


def build_summary_rows(results, tier_rows, store_map, target_map, duty_days_map, days):
    """从 Result 聚合 + 逐笔行构建 Sheet1「计算结果」行列表（26 列，与 CLI Sheet1 对齐）。
    排序：person 按总提成降序，store 按提成降序（与 CLI exporter_helpers 一致）。
    """
    from collections import defaultdict
    from decimal import Decimal

    # 5 档聚合：{(person, store, tier): [amount, commission, rate]}
    tier_agg = {}
    for r in tier_rows:
        tier = r.get("tier")
        if not tier or tier not in _TIERS:
            continue
        key = (r["person"], r["store"], tier)
        if key not in tier_agg:
            tier_agg[key] = [Decimal(0), Decimal(0), r.get("rate")]
        tier_agg[key][0] += r.get("amount") or 0
        tier_agg[key][1] += r.get("commission") or 0

    persons = defaultdict(list)
    for res in results:
        persons[res.person].append(res)
    person_total = {p: sum((r.commission or 0) for r in rs) for p, rs in persons.items()}

    out = []
    for person in sorted(person_total, key=lambda p: float(person_total[p]), reverse=True):
        stores_data = sorted(persons[person], key=lambda r: float(r.commission or 0), reverse=True)
        for res in stores_data:
            store = res.store
            store_class = store_map[store].store_class if store in store_map else ""
            monthly_target = Decimal(target_map.get(store, 0) or 0)
            daily_target = monthly_target / days if days else Decimal(0)
            duty = duty_days_map.get((person, store), 0)
            actual_target = daily_target * duty
            row = [
                person, store, store_class,
                round(float(monthly_target), 2), round(float(daily_target), 2),
                duty, round(float(actual_target), 2),
                round(float(res.sales or 0), 2),
                round(float(res.achievement or 0) * 100, 1),
                _bucket_display(res.bucket), round(float(res.commission or 0), 2),
            ]
            for tier in _TIERS:
                amount, comm, rate = tier_agg.get((person, store, tier), (Decimal(0), Decimal(0), None))
                rate_pct = f"{float(rate) * 100:.1f}%" if rate is not None else ""
                row.extend([round(float(amount), 2), rate_pct, round(float(comm), 2)])
            out.append(row)
    return out
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_ledger_export.py -v`
Expected: 2 passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/ledger_export.py backend/tests/test_ledger_export.py
git commit -m "feat(export): Sheet1 计算结果汇总构建器 build_summary_rows（ADR-020）"
```

---

### Task 2: Sheet3 构建器 `build_duty_grid`

**Files:**
- Modify: `backend/app/services/ledger_export.py`
- Test: `backend/tests/test_ledger_export.py`

**Interfaces:**
- Consumes: `duty_rows` = list of `Duty` ORM 行（属性 `store/duty_date/salesperson`）
- Produces: `build_duty_grid(duty_rows) -> {store: {day(int): salesperson}}`

- [ ] **Step 1: 写失败测试**

追加到 `backend/tests/test_ledger_export.py`：

```python
def test_build_duty_grid():
    from backend.app.services.ledger_export import build_duty_grid
    d1 = SimpleNamespace(store="福景店", duty_date=date(2026, 6, 1), salesperson="高睿")
    d2 = SimpleNamespace(store="福景店", duty_date=date(2026, 6, 2), salesperson="张三")
    d3 = SimpleNamespace(store="螺农店", duty_date=date(2026, 6, 1), salesperson="李四")
    assert build_duty_grid([d1, d2, d3]) == {
        "福景店": {1: "高睿", 2: "张三"},
        "螺农店": {1: "李四"},
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_ledger_export.py::test_build_duty_grid -v`
Expected: FAIL — `ImportError: cannot import name 'build_duty_grid'`

- [ ] **Step 3: 实现 `build_duty_grid`**

追加到 `backend/app/services/ledger_export.py`：

```python
def build_duty_grid(duty_rows):
    """考勤排版矩阵：{store: {day(int): salesperson}}，与前端 DutyGrid 一致。"""
    grid = {}
    for d in duty_rows:
        grid.setdefault(d.store, {})[d.duty_date.day] = d.salesperson
    return grid
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_ledger_export.py::test_build_duty_grid -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/ledger_export.py backend/tests/test_ledger_export.py
git commit -m "feat(export): Sheet3 考勤排版构建器 build_duty_grid（ADR-020）"
```

---

### Task 3: 三 sheet writer `write_salary_export`

**Files:**
- Modify: `backend/app/services/ledger_export.py`（抽 `_write_ledger_sheet`，新增 `_write_summary_sheet` / `_write_duty_sheet` / `write_salary_export`；`write_ledger_excel` 改为薄封装，Task 4 才删）
- Test: `backend/tests/test_ledger_export.py`

**Interfaces:**
- Consumes: Task 1/2 的 `build_summary_rows`、`build_duty_grid`
- Produces: `write_salary_export(month: str, summary_rows: list[list], ledger_rows: list[dict], duty_grid: dict, days: int, path: str)` → 写三 sheet xlsx。sheet 顺序：`["计算结果", "提成台账-{month}", "考勤排版"]`。

- [ ] **Step 1: 写失败测试**

追加到 `backend/tests/test_ledger_export.py`：

```python
def test_write_salary_export_three_sheets(tmp_path):
    import openpyxl
    from backend.app.services.ledger_export import (
        write_salary_export, build_summary_rows, build_duty_grid)

    results = [_result("高睿", "福景店", "10", "1", "1", "GE_100", "1.4")]
    tier_rows = [{"person": "高睿", "store": "福景店", "tier": "低温高毛",
                  "rate": Decimal("0.14"), "amount": Decimal("10"), "commission": Decimal("1.4")}]
    summary = build_summary_rows(
        results, tier_rows,
        {"福景店": SimpleNamespace(store_class="A")},
        {"福景店": Decimal("30")}, {("高睿", "福景店"): 1}, 30)
    ledger = [{
        "person": "高睿", "store": "福景店", "sale_date": date(2026, 6, 1),
        "barcode": "6920001", "product_name": "低温奶", "tag": "有效计提",
        "tier": "低温高毛", "bucket": "GE_100", "rate": Decimal("0.14"),
        "amount": Decimal("10"), "commission": Decimal("1.4"),
        "receipt": "R001", "src_order": None, "qty": 1, "unit_price": Decimal("10"),
        "salesperson": "高睿", "cashier": "", "is_return": False, "is_online": False,
        "original_store": None, "original_date": None, "transfer_reason": None, "extra": None,
    }]
    duty_rows = [SimpleNamespace(store="福景店", duty_date=date(2026, 6, 1), salesperson="高睿")]
    duty_grid = build_duty_grid(duty_rows)
    out = tmp_path / "out.xlsx"
    write_salary_export("2026-06", summary, ledger, duty_grid, 30, str(out))

    wb = openpyxl.load_workbook(out)
    assert wb.sheetnames == ["计算结果", "提成台账-2026-06", "考勤排版"], wb.sheetnames

    ws1 = wb["计算结果"]
    h1 = list(ws1.iter_rows(values_only=True))
    assert h1[0][0] == "员工姓名" and h1[0][10] == "提成金额"
    assert h1[1][0] == "高睿" and h1[1][10] == 1.4

    ws2 = wb["提成台账-2026-06"]
    h2 = list(ws2.iter_rows(values_only=True))
    assert h2[0][0] == "归属人" and h2[0][2] == "归属日"
    assert h2[1][0] == "高睿" and h2[1][1] == "福景店"

    ws3 = wb["考勤排版"]
    h3 = list(ws3.iter_rows(values_only=True))
    assert h3[0][0] == "门店" and h3[0][1] == "1号" and h3[0][30] == "30号"
    assert h3[1][0] == "福景店" and h3[1][1] == "高睿"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_ledger_export.py::test_write_salary_export_three_sheets -v`
Expected: FAIL — `ImportError: cannot import name 'write_salary_export'`

- [ ] **Step 3: 实现三 sheet writer（重构现有 writer）**

把 `write_ledger_excel` 主体抽成 `_write_ledger_sheet(ws, rows)`（表头 + 样式 + 数据行 + 列宽 + 冻结），新增三个私有 writer 与公开入口。替换 `write_ledger_excel` 为薄封装：

```python
_SUMMARY_HEADERS = [
    "员工姓名", "门店", "门店类型", "月目标", "日目标", "考勤天数", "实际目标",
    "销售额", "达标率", "达标档位", "提成金额",
    "常温高毛_销售", "常温高毛_比例", "常温高毛_提成",
    "常温低毛_销售", "常温低毛_比例", "常温低毛_提成",
    "低温高毛_销售", "低温高毛_比例", "低温高毛_提成",
    "低温低毛_销售", "低温低毛_比例", "低温低毛_提成",
    "特价_销售", "特价_比例", "特价_提成",
]


def _style_header(ws, ncols):
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, Side
    font = Font(bold=True)
    align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Border(left=Side(style="thin"), right=Side(style="thin"),
                  top=Side(style="thin"), bottom=Side(style="thin"))
    for cell in ws[1]:
        cell.font = font
        cell.alignment = align
        cell.border = thin
    for col in range(1, ncols + 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 12


def _write_summary_sheet(ws, summary_rows):
    ws.append(_SUMMARY_HEADERS)
    _style_header(ws, len(_SUMMARY_HEADERS))
    for row in summary_rows:
        ws.append(row)
    ws.freeze_panes = "A2"


def _write_ledger_sheet(ws, rows):
    # 原 write_ledger_excel 的表头/样式/数据行/列宽/冻结逻辑，原样搬入
    headers = [h for h, _ in _COLUMNS]
    ws.append(headers)
    _style_header(ws, len(_COLUMNS))
    for r in rows:
        transferred = bool(r.get("original_store"))
        row_vals = []
        for _, key in _COLUMNS:
            if key == "__transferred__":
                row_vals.append(_fmt(transferred, key))
            elif key == "__extra__":
                row_vals.append(_fmt(r.get("extra"), key))
            else:
                row_vals.append(_fmt(r.get(key), key))
        ws.append(row_vals)
    for idx, (hdr, _) in enumerate(_COLUMNS, start=1):
        if hdr in ("源字段", "调整原因", "商品名称"):
            ws.column_dimensions[openpyxl.utils.get_column_letter(idx)].width = 32
        elif hdr in ("去向标签", "商品档位", "达成档", "原门店", "原日期"):
            ws.column_dimensions[openpyxl.utils.get_column_letter(idx)].width = 14
    ws.freeze_panes = "A2"


def _write_duty_sheet(ws, duty_grid, days):
    ws.append(["门店"] + [f"{d}号" for d in range(1, days + 1)])
    for store in sorted(duty_grid):
        ws.append([store] + [duty_grid[store].get(d, "") for d in range(1, days + 1)])
    ws.freeze_panes = "B2"
    ws.column_dimensions["A"].width = 14


def write_ledger_excel(rows, path, month):
    """兼容旧签名（Task 4 删除）：只写逐笔台账。"""
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"提成台账-{month}"
    _write_ledger_sheet(ws, rows)
    wb.save(path)


def write_salary_export(month, summary_rows, ledger_rows, duty_grid, days, path):
    """写三 sheet 工资导出（ADR-020）：计算结果 + 提成台账 + 考勤排版。"""
    import openpyxl
    wb = openpyxl.Workbook()
    ws1 = wb.active
    ws1.title = "计算结果"
    _write_summary_sheet(ws1, summary_rows)
    ws2 = wb.create_sheet(f"提成台账-{month}")
    _write_ledger_sheet(ws2, ledger_rows)
    ws3 = wb.create_sheet("考勤排版")
    _write_duty_sheet(ws3, duty_grid, days)
    wb.save(path)
```

> 注意：`_style_header` 里引用了 `openpyxl.utils.get_column_letter`，需确保 `import openpyxl` 在函数内或模块顶部存在。`write_ledger_excel` 保留以维持既有 `_fmt`/`_COLUMNS` 依赖测试绿灯。

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_ledger_export.py -v`
Expected: 4 passed（Task 1 的 2 个 + Task 2 的 1 个 + Task 3 的 1 个）

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/ledger_export.py backend/tests/test_ledger_export.py
git commit -m "feat(export): 三 sheet writer write_salary_export（ADR-020）"
```

---

### Task 4: 导出端点接线 + 对账集成测试

**Files:**
- Modify: `backend/app/routers/workflow.py:500-531`（export 端点）
- Modify: `backend/app/services/ledger_export.py`（删除 `write_ledger_excel`）
- Test: `backend/tests/test_workflow.py`

**Interfaces:**
- Consumes: `write_salary_export` / `build_summary_rows` / `build_duty_grid`（ledger_export）、`days_in_month`（engine_bridge）、`Result`/`Store`/`MonthlyTarget`/`Duty`（db）
- Produces: `/months/{month}/export` 返回三 sheet xlsx

- [ ] **Step 1: 写失败集成测试**

追加到 `backend/tests/test_workflow.py`：

```python
def test_export_three_sheets_and_reconciliation(tmp_path, client):
    """ADR-020：/export 三 sheet；Sheet1 Σ提成 == Sheet2 Σ提成 == /results Σ；Sheet3 考勤矩阵正确。"""
    import io
    import openpyxl

    h = auth_header(client)
    _setup_computed_month(tmp_path, client, h)

    salary_total = sum(
        x["commission"] for x in
        client.get("/months/2026-06/results", headers=h).json()["salary"])

    r = client.get("/months/2026-06/export", headers=h)
    assert r.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(r.content), read_only=True)
    assert wb.sheetnames == ["计算结果", "提成台账-2026-06", "考勤排版"], wb.sheetnames

    ws1 = wb["计算结果"]
    rows1 = list(ws1.iter_rows(values_only=True))
    h1 = list(rows1[0]); ci = h1.index("提成金额")
    sum1 = sum((r[ci] or 0) for r in rows1[1:])

    ws2 = wb["提成台账-2026-06"]
    rows2 = list(ws2.iter_rows(values_only=True))
    h2 = list(rows2[0]); c2 = h2.index("提成金额")
    sum2 = sum((r[c2] or 0) for r in rows2[1:])

    assert abs(sum1 - salary_total) < 0.01, f"Sheet1 Σ={sum1} != 工资总额={salary_total}"
    assert abs(sum2 - salary_total) < 0.01, f"Sheet2 Σ={sum2} != 工资总额={salary_total}"

    ws3 = wb["考勤排版"]
    rows3 = list(ws3.iter_rows(values_only=True))
    assert rows3[0][0] == "门店" and rows3[0][1] == "1号"
    assert any(r[0] == "福景店" and r[1] == "高睿" for r in rows3[1:]), "考勤排版缺福景店/高睿"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_workflow.py::test_export_three_sheets_and_reconciliation -v`
Expected: FAIL — `assert wb.sheetnames == [...]`（当前只有 `["提成台账-2026-06"]`）

- [ ] **Step 3: 改端点 + 删旧 writer**

(a) 替换 `workflow.py` 中 export 函数体：

```python
@router.get("/months/{month}/export")
def export(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """导出三 sheet 工资表（ADR-020）：Sheet1 计算结果汇总 + Sheet2 逐笔提成台账 + Sheet3 考勤排版。
    读物化 Result/DetailRow JOIN SalesRecord + MonthlyTarget/Duty/Store，零重算（治 R1）。"""
    from sqlalchemy import text
    from backend.app.db import Result, Store, MonthlyTarget, Duty
    from backend.app.services.engine_bridge import days_in_month
    from backend.app.services.ledger_export import (
        write_salary_export, build_summary_rows, build_duty_grid)

    rows = db.execute(text("""
        SELECT d.person, d.store, d.sale_date, d.barcode, d.product_name,
               d.tier, d.bucket, d.rate, d.amount, d.commission, d.tag,
               s.receipt, s.src_order, s.qty, s.unit_price, s.salesperson, s.cashier,
               s.is_return, s.is_online,
               s.original_store, s.original_date, s.transfer_reason, s.extra
        FROM detail_rows d JOIN sales_records s ON d.sales_record_id = s.id
        WHERE d.month = :m
        ORDER BY d.person, d.store, d.sale_date
    """), {"m": month}).mappings().all()
    ledger = [dict(r) for r in rows]

    result_rows = db.query(Result).filter_by(month=month).all()
    store_map = {s.name: s for s in db.query(Store).all()}
    target_map = {t.store: t.target for t in db.query(MonthlyTarget).filter_by(month=month).all()}
    duty_rows = db.query(Duty).filter_by(month=month).all()
    duty_days_map = {}
    for d in duty_rows:
        duty_days_map[(d.salesperson, d.store)] = duty_days_map.get((d.salesperson, d.store), 0) + 1
    days = days_in_month(month)
    summary = build_summary_rows(result_rows, ledger, store_map, target_map, duty_days_map, days)
    duty_grid = build_duty_grid(duty_rows)

    fd, path = tempfile.mkstemp(suffix=".xlsx")
    _os.close(fd)
    try:
        write_salary_export(month, summary, ledger, duty_grid, days, path)
        with open(path, "rb") as f:
            data = f.read()
    finally:
        _os.remove(path)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="salary_{month}.xlsx"'})
```

(b) 删除 `backend/app/services/ledger_export.py` 中的 `write_ledger_excel`（薄封装已无调用方）。

- [ ] **Step 4: 运行确认通过 + 回归**

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/test_workflow.py -v`
Expected: ALL PASS（含新增三 sheet 测试 + 既有导出测试 `test_export_reads_materialized_no_recompute` / `test_export_ledger_has_tags_and_fields` / `test_export_ledger_shows_transfer` / `test_export_ledger_commission_matches_salary_total`）

Run: `cd /Users/duo/Documents/mytechcode/salary-calculation && .venv/bin/python -m pytest backend/tests/ -v`
Expected: ALL PASS（全 backend 回归）

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/app/services/ledger_export.py backend/tests/test_workflow.py
git commit -m "feat(export): /months/{month}/export 三 sheet 接线 + 对账闭环（ADR-020）"
```

---

## 自检（Self-Review）

- **Spec 覆盖**：Sheet1 构建（Task 1 ✓）、Sheet3 构建（Task 2 ✓）、三 sheet writer（Task 3 ✓）、端点接线 + 对账测试（Task 4 ✓）；零重算守卫（Task 4 回归，既有测试 `test_export_reads_materialized_no_recompute` ✓）；Sheet2 名称保留（Task 3/4 ✓）。
- **占位符扫描**：无 TBD/TODO；每步含完整代码 + 命令 + 预期输出。
- **类型一致性**：`build_summary_rows(results, tier_rows, store_map, target_map, duty_days_map, days)`、`build_duty_grid(duty_rows)`、`write_salary_export(month, summary_rows, ledger_rows, duty_grid, days, path)` 在 Task 1/2/3/4 签名一致；`_write_ledger_sheet(ws, rows)` 在 Task 3 定义、Task 3/4 使用一致。
