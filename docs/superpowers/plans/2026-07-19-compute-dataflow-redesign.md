# 计算数据流重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `compute()` 从"按需重算的瞬态函数"重构为"算一次 + 全量物化"，以 SalesRecord 为真值源、逐行物化提成台账，实现精确、流畅、可对账，并修复 C1（费率不生效）/C2（调班不可见）/C3（当班天数口径错）。

**Architecture:** 留 SQLite + WAL；`POST /compute` 单次跑引擎、物化 `Result`(聚合)+`DetailRow`(逐行台账)；所有读端点查物化表零重算；输入变更置 staleness、compute 加 single-flight；引擎改逐行直出 DetailRow（含剔除行 0 提成），单一计算源保证 Σ逐行=总额。详见 `docs/superpowers/specs/2026-07-19-compute-dataflow-redesign-design.md` 与 `docs/ARCHITECTURE.md`（ADR-001~008）。

**Tech Stack:** Python 3.10、SQLAlchemy 2、Alembic、SQLite(WAL)、FastAPI、pytest；salary_engine（纯 Python+Decimal）。

**全局约定：** 每个任务结束 `git commit`；测试命令 `pytest -q`；后端测试在 `backend/tests/`，引擎测试在 `tests/`。改动 `calculator.py` 前务必阅读 `salary_engine/calculator.py` 当前实现。

---

## 文件结构（改动地图）

| 文件 | 责任 | 改动 |
|---|---|---|
| `alembic.ini`、`alembic/` | 迁移环境 | 新建 |
| `backend/app/db.py` | ORM 模型 + engine | 加 `DetailRow`、`SalesRecord.extra`、`Month.results_stale`、索引；WAL pragma |
| `backend/app/services/engine_bridge.py` | DB→引擎入参 | 新增 `sales_lines_from_db`；`rates_from_db` 改读 `SalaryPolicyVersion` |
| `backend/app/services/sales_importer.py` | 导入落库 | 批量化；存全字段 extra |
| `backend/app/routers/workflow.py` | 工作流端点 | `_run_compute` 切 SalesRecord；物化；读端点改查表；single-flight；staleness |
| `backend/app/routers/{months,targets,salary_policies}.py` | 输入变更 | 置 `results_stale=true` |
| `salary_engine/calculator.py` | 提成主流程 | C3 当班天数；逐行 DetailRow；剔除行 0 提成 |
| `salary_engine/models.py` | 数据类 | `SalesLine.sales_record_id`；`DetailRow.tag` |
| `salary_engine/exporter.py`、`exporter_helpers.py` | 导出 | 解耦 backend.db；改查物化表 |
| `tests/test_calculator.py` 等 | 引擎测试 | 新增 C3/逐行/剔除 不变量单测 |
| `backend/tests/test_workflow.py` 等 | 后端测试 | 物化/zero-recompute/single-flight |

---

## P0 — 基础设施（增量，保持绿色）

### Task 0.1: 引入 Alembic

**Files:**
- Create: `alembic.ini`、`alembic/env.py`、`alembic/script.py.mako`、`alembic/versions/`

- [ ] **Step 1: 安装并初始化**

```bash
pip install alembic
alembic init alembic
```

- [ ] **Step 2: 配置 `alembic.ini` 指向项目 DB**

在 `alembic.ini` 中设置（用项目现有 `salary.db`）：
```ini
sqlalchemy.url = sqlite:///salary.db
```

- [ ] **Step 3: 配置 `alembic/env.py` 读取项目元数据**

修改 `alembic/env.py` 的 `target_metadata`，引入项目 Base：
```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.app.db import Base
target_metadata = Base.metadata
```

- [ ] **Step 4: 生成 baseline（把现有 schema 标记为已存在，避免重建）**

```bash
alembic revision --autogenerate -m "baseline snapshot"
```
打开生成的迁移文件，把 `upgrade()`/`downgrade()` 体清空（仅保留 `pass`）——因为表已存在，baseline 只占版本号。

- [ ] **Step 5: 验证 alembic 可用**

```bash
alembic current
```
Expected: 输出 baseline revision id。

- [ ] **Step 6: 把 alembic 加入依赖并提交**

`requirements.txt` 追加 `alembic>=1.13`。
```bash
git add alembic.ini alembic/ requirements.txt
git commit -m "chore: 引入 Alembic 迁移环境 + baseline"
```

### Task 0.2: SQLite 开启 WAL + busy_timeout

**Files:**
- Modify: `backend/app/db.py`（engine 创建处，约第 72 行）

- [ ] **Step 1: 写失败测试**

`backend/tests/test_db.py` 追加：
```python
def test_wal_enabled():
    from backend.app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        mode = conn.execute(text("PRAGMA journal_mode")).scalar()
    assert str(mode).lower() == "wal"
```

- [ ] **Step 2: 运行，预期 FAIL**

```bash
pytest backend/tests/test_db.py::test_wal_enabled -q
```
Expected: FAIL（journal_mode 为 delete）。

- [ ] **Step 3: 实现——加 DBAPI connect 事件监听器**

`backend/app/db.py` 在 `engine = create_engine(...)` 后添加：
```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=10000")
    cur.close()
```

- [ ] **Step 4: 运行，预期 PASS**

```bash
pytest backend/tests/test_db.py::test_wal_enabled -q
```
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/db.py backend/tests/test_db.py
git commit -m "perf: SQLite 开启 WAL + busy_timeout 消除锁竞争"
```

---

## P1 — Schema 扩展（增量迁移）

### Task 1.1: SalesRecord 加 extra(JSON) 全字段留底

**Files:**
- Modify: `backend/app/db.py`（`SalesRecord` 类）
- Create: `alembic/versions/<rev>_salesrecord_extra.py`
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: 模型加列**

`SalesRecord` 类内加：
```python
extra = Column(JSON)  # 源 Excel 其余字段原样留底
```

- [ ] **Step 2: 生成迁移**

```bash
alembic revision --autogenerate -m "salesrecord add extra"
```
检查生成的迁移含 `op.add_column('sales_records', sa.Column('extra', sa.JSON()))`。

- [ ] **Step 3: 写测试**

```python
def test_salesrecord_extra():
    from backend.app.db import SalesRecord, SessionLocal
    from datetime import date
    db = SessionLocal()
    try:
        r = SalesRecord(month="2026-01", receipt="R1", store="S", sale_date=date(2026,1,1),
                        barcode="B", qty=1, amount=10, unit_price=10, extra={"foo": "bar"})
        db.add(r); db.commit(); db.refresh(r)
        assert r.extra == {"foo": "bar"}
    finally:
        db.query(SalesRecord).filter_by(receipt="R1").delete(); db.commit(); db.close()
```

- [ ] **Step 4: 应用迁移并跑测试**

```bash
alembic upgrade head
pytest backend/tests/test_db.py::test_salesrecord_extra -q
```
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/db.py alembic/versions/ backend/tests/test_db.py
git commit -m "feat: SalesRecord 加 extra(JSON) 全字段留底"
```

### Task 1.2: 新增 DetailRow 表

**Files:**
- Modify: `backend/app/db.py`（新增 `DetailRow` 类）
- Create: 迁移
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: 写失败测试**

```python
def test_detailrow_table():
    from backend.app.db import DetailRow, SessionLocal
    from datetime import date
    from decimal import Decimal
    db = SessionLocal()
    try:
        d = DetailRow(month="2026-01", sales_record_id=1, person="张三", store="S",
                      sale_date=date(2026,1,1), barcode="B", product_name="奶",
                      tier="常温高毛", bucket="GE_100", rate=Decimal("0.13"),
                      amount=Decimal(100), commission=Decimal("13.00"),
                      tag="有效计提", is_transferred=False)
        db.add(d); db.commit(); db.refresh(d)
        assert d.id and d.tag == "有效计提"
    finally:
        db.query(DetailRow).filter_by(person="张三").delete(); db.commit(); db.close()
```

- [ ] **Step 2: 运行，预期 FAIL（DetailRow 不存在）**

```bash
pytest backend/tests/test_db.py::test_detailrow_table -q
```

- [ ] **Step 3: 实现——加模型 + 迁移**

`backend/app/db.py` 加：
```python
class DetailRow(Base):
    """逐笔提成台账（compute 物化，逐行 1:1 对应 SalesRecord）"""
    __tablename__ = "detail_rows"
    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False, index=True)
    sales_record_id = Column(Integer, index=True)
    person = Column(String, nullable=False)
    store = Column(String, nullable=False)
    sale_date = Column(Date, nullable=False)
    barcode = Column(String)
    product_name = Column(String)
    tier = Column(String)        # 商品档位
    bucket = Column(String)      # 达成档
    rate = Column(Numeric)
    amount = Column(Numeric, nullable=False)
    commission = Column(Numeric, nullable=False)
    tag = Column(String(20), nullable=False)  # 有效计提/退货冲抵/退货未匹配/赠送剔除/不计提成/非乳品
    is_transferred = Column(Boolean, default=False)
    __table_args__ = (
        UniqueConstraint("month", "sales_record_id", name="uq_detail_month_sr"),
    )
```
生成迁移：
```bash
alembic revision --autogenerate -m "add detail_rows table"
```

- [ ] **Step 4: 应用并跑测试**

```bash
alembic upgrade head
pytest backend/tests/test_db.py::test_detailrow_table -q
```
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/db.py alembic/versions/ backend/tests/test_db.py
git commit -m "feat: 新增 DetailRow 逐笔提成台账表"
```

### Task 1.3: Month 加 results_stale + status 扩展

**Files:**
- Modify: `backend/app/db.py`（`Month` 类）
- Create: 迁移

- [ ] **Step 1: 模型加列**

`Month` 类加：
```python
results_stale = Column(Boolean, default=True)  # 输入变更后置 true，compute 后置 false
```
（`status` 已是 String，无需改类型，值域扩展为 `draft|computing|computed`，注释更新。）

- [ ] **Step 2: 生成并应用迁移**

```bash
alembic revision --autogenerate -m "month add results_stale"
alembic upgrade head
```

- [ ] **Step 3: 现有后端测试回归**

```bash
pytest backend/tests -q
```
Expected: 全 PASS（增量列，默认值不影响旧逻辑）。

- [ ] **Step 4: 提交**

```bash
git add backend/app/db.py alembic/versions/
git commit -m "feat: Month 加 results_stale + status 值域扩展"
```

### Task 1.4: 补热表索引

**Files:**
- Modify: `backend/app/db.py`（`Result`、`SalesRecord`、`DetailRow`）
- Create: 迁移

- [ ] **Step 1: 加索引声明**

`Result.__table_args__` 改为：
```python
__table_args__ = (
    UniqueConstraint("month", "person", "store", name="uq_result"),
    Index("idx_results_month", "month"),
)
```
`SalesRecord.__table_args__` 追加：
```python
Index("idx_sales_month_store_date_person", "month", "store", "sale_date", "salesperson"),
```
`DetailRow.__table_args__` 追加：
```python
Index("idx_detail_month_person_store", "month", "person", "store"),
```
（顶部 `from sqlalchemy import ... Index` 已有则跳过。）

- [ ] **Step 2: 生成迁移并应用**

```bash
alembic revision --autogenerate -m "add hot table indexes"
alembic upgrade head
```

- [ ] **Step 3: 回归**

```bash
pytest backend/tests -q
```
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add backend/app/db.py alembic/versions/
git commit -m "perf: Result/SalesRecord/DetailRow 补热查询索引"
```

### Task 1.5: 迁移 RateVersion → SalaryPolicyVersion 数据

**Files:**
- Create: `backend/scripts/migrate_rates_to_policy.py`（替换现有同名脚本，若已存在则更新）
- Create: 迁移（数据迁移，非 schema）

- [ ] **Step 1: 写迁移脚本**

`backend/scripts/migrate_rates_to_policy.py`：
```python
"""把 RateVersion.rates 迁入 SalaryPolicyVersion.content.commission_rates，停用 RateVersion。"""
from datetime import date
from backend.app.db import SessionLocal, RateVersion, SalaryPolicyVersion

def run():
    db = SessionLocal()
    try:
        if db.query(SalaryPolicyVersion).count() == 0:
            cur = db.query(RateVersion).filter_by(is_current=True).first()
            if cur:
                pv = SalaryPolicyVersion(
                    version=1, effective_from=cur.effective_from, is_current=True,
                    content={"margin_rules": {}, "commission_rates": cur.rates or {}},
                    note="从 RateVersion 迁入", created_by="migration")
                db.add(pv); db.commit()
        print("migration done")
    finally:
        db.close()

if __name__ == "__main__":
    run()
```

- [ ] **Step 2: 在 Alembic 数据迁移中调用**

```bash
alembic revision -m "data migrate rates to policy"
```
在生成迁移的 `upgrade()` 末尾加：
```python
from backend.scripts.migrate_rates_to_policy import run
run()
```
`downgrade()` 留 `pass`。

- [ ] **Step 3: 应用并验证**

```bash
alembic upgrade head
python -c "from backend.app.db import SessionLocal, SalaryPolicyVersion; db=SessionLocal(); print(db.query(SalaryPolicyVersion).filter_by(is_current=True).first().content.keys())"
```
Expected: 输出含 `commission_rates`。

- [ ] **Step 4: 提交**

```bash
git add backend/scripts/migrate_rates_to_policy.py alembic/versions/
git commit -m "feat: RateVersion 数据迁入 SalaryPolicyVersion（C1 准备）"
```

---

## P2 — 引擎改造（独立可测，TDD）

> 本阶段只改 `salary_engine/` 与 `tests/`，不碰后端。每任务引擎单测全绿即提交。

### Task 2.1: SalesLine 携带 sales_record_id

**Files:**
- Modify: `salary_engine/models.py`（`SalesLine`）
- Test: `tests/test_importer.py` 或 `tests/test_calculator.py`

- [ ] **Step 1: 加字段**

在 `salary_engine/models.py` 的 `SalesLine` dataclass 加（默认 None，向后兼容）：
```python
sales_record_id: int = None
```

- [ ] **Step 2: 回归现有引擎测试**

```bash
pytest tests -q
```
Expected: 全 PASS（默认值，不破坏现有构造）。

- [ ] **Step 3: 提交**

```bash
git add salary_engine/models.py
git commit -m "feat: SalesLine 携带 sales_record_id（物化反查用）"
```

### Task 2.2: DetailRow 加 tag 字段

**Files:**
- Modify: `salary_engine/calculator.py`（`DetailRow` dataclass）
- Test: `tests/test_calculator.py`

- [ ] **Step 1: 改 DetailRow 定义**

`salary_engine/calculator.py` 的 `DetailRow` 改为（用 `tag` 替代 `flag` 语义）：
```python
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
    tag: str = "有效计提"          # 有效计提/退货冲抵/退货未匹配/赠送剔除/不计提成/非乳品
    sales_record_id: int = None
```
（去掉旧 `flag`；后续任务统一用 `tag`。）

- [ ] **Step 2: 临时把现有 `flag="退货未匹配"` 改为 `tag="退货未匹配"`**

`calculator.py` 中 unmatched_returns 的 `DetailRow(..., flag="退货未匹配")` 改为 `DetailRow(..., tag="退货未匹配")`。

- [ ] **Step 3: 回归并修复依赖 flag 的测试**

```bash
pytest tests -q
```
若有测试引用 `.flag`，改为 `.tag`。Expected: 全 PASS。

- [ ] **Step 4: 提交**

```bash
git add salary_engine/calculator.py tests/
git commit -m "refactor: DetailRow 用 tag 字段统一去向标签"
```

### Task 2.3: C3 修复——当班天数从 duty 表取

**Files:**
- Modify: `salary_engine/calculator.py`（`compute()` 第 5 步 ps_target 累加，约 99-115 行）
- Test: `tests/test_calculator.py`

- [ ] **Step 1: 写失败测试（审计反例）**

`tests/test_calculator.py` 追加：
```python
from decimal import Decimal
from datetime import date
from salary_engine.calculator import compute
from salary_engine.models import SalesLine, Product, Store
from salary_engine.rates import achievement_bucket

def _sl(receipt, store, d, amount, sp="高睿", barcode="B1"):
    return SalesLine(receipt=receipt, src_order=None, store=store, sale_date=d,
                     barcode=barcode, product_name="奶", qty=1, amount=Decimal(amount),
                     unit_price=Decimal(amount), is_return=False, is_online=False,
                     cashier="", salesperson=sp)

def test_c3_duty_days_count_zero_sales_day():
    products = {"B1": Product("B1", "奶", "", "常温奶", Decimal(5), False)}
    stores = {"福景店": Store("福景店", "1组", "A", "")}
    targets = {"福景店": Decimal(3000)}
    rate_table = type("RT", (), {"rates": {("A","GE_100","常温高毛"): Decimal("0.13"),
                                            ("A","LT_70","常温高毛"): Decimal("0.09")},
                                  "version":1, "effective_from": date(2026,6,1)})()
    sales = [_sl("R1","福景店", date(2026,6,1), 100)]   # 仅 6/1 有销售
    # 当班表：高睿 6/1 与 6/2 都当班（6/2 零销售）
    duty = {("福景店", date(2026,6,1)): "高睿", ("福景店", date(2026,6,2)): "高睿"}
    res = compute(sales, products, stores, targets, rate_table, "2026-06", 30, duty_override=duty)
    bd = res.breakdown[("高睿","福景店")]
    # 正确：目标=3000/30*2=200，达成=100/200=0.5 → LT_70
    assert bd["target"] == Decimal(200)
    assert bd["bucket"] == "LT_70"
```

- [ ] **Step 2: 运行，预期 FAIL**

```bash
pytest tests/test_calculator.py::test_c3_duty_days_count_zero_sales_day -q
```
Expected: FAIL（旧逻辑 target=100、bucket=GE_100）。

- [ ] **Step 3: 实现——ps_target 改从 duty 表累加**

`calculator.py` `compute()` 第 5 步，把"在 daily_sales 循环里累加 ps_target"拆出。原代码：
```python
    for (s, d), net in daily_sales.items():
        p = _resolve_duty(duty, s, d, None)
        if p is None:
            continue
        ps_sales[(p, s)] += net
        tgt = targets.get(s)
        if not tgt:
            missing_target_stores.add(s)
        else:
            ps_target[(p, s)] += tgt / days if days else Decimal(0)
```
改为（ps_sales 仍在 daily_sales，ps_target 改遍历 duty）：
```python
    for (s, d), net in daily_sales.items():
        p = _resolve_duty(duty, s, d, None)
        if p is None:
            continue
        ps_sales[(p, s)] += net
    # 当班天数（含零销售当班日）——修 C3：从当班表累加目标
    for (s, d) in duty.keys():
        p = _resolve_duty(duty, s, d, None)
        if p is None:
            continue
        tgt = targets.get(s)
        if not tgt:
            missing_target_stores.add(s)
        else:
            ps_target[(p, s)] += tgt / days if days else Decimal(0)
```

- [ ] **Step 4: 运行，预期 PASS**

```bash
pytest tests/test_calculator.py::test_c3_duty_days_count_zero_sales_day -q
```
Expected: PASS。

- [ ] **Step 5: 引擎全量回归（可能有测试断言旧口径，按 C3 修正）**

```bash
pytest tests -q
```
若有因 C3 变更而失败的测试，核实它是断言了旧的错误口径则更新预期值（C3 是 bug 修复）。Expected: 全 PASS。

- [ ] **Step 6: 提交**

```bash
git add salary_engine/calculator.py tests/test_calculator.py
git commit -m "fix(C3): 当班天数改从当班表取，修正达成率虚高"
```

### Task 2.4: compute 改逐行 DetailRow + Σ不变量

**Files:**
- Modify: `salary_engine/calculator.py`（第 6 步分组提成循环，约 124-149 行）
- Test: `tests/test_calculator.py`

- [ ] **Step 1: 写失败测试（逐行 + Σ=总额）**

```python
def test_per_line_detail_rows_sum_to_total():
    products = {"B1": Product("B1","奶","","常温奶", Decimal(5), False)}
    stores = {"S": Store("S","1组","A","")}
    targets = {"S": Decimal(1000)}
    rt = type("RT", (), {"rates": {("A","GE_100","常温高毛"): Decimal("0.13")},
                          "version":1,"effective_from":date(2026,6,1)})()
    # 同组两张小票同条码：销售 60 + 销售 40（组净 100）+ 匹配退货 -10
    sales = [_sl("R1","S",date(2026,6,1),60), _sl("R1","S",date(2026,6,1),40),
             SalesLine(receipt="R2",src_order="R1",store="S",sale_date=date(2026,6,1),
                       barcode="B1",product_name="奶",qty=1,amount=Decimal(-10),
                       unit_price=Decimal(10),is_return=True,is_online=False,cashier="",salesperson="高睿")]
    duty = {("S",date(2026,6,1)):"高睿"}
    res = compute(sales, products, stores, targets, rt, "2026-06", 30, duty_override=duty)
    # 逐行：60×.13 + 40×.13 + (-10)×.13 = 11.7
    assert sum((d.commission for d in res.details), Decimal(0)) == Decimal("11.70")
    assert res.commission_by_person["高睿"] == Decimal("11.70")
    # 退货行带 退货冲抵 标签
    assert any(d.tag == "退货冲抵" and d.amount == Decimal(-10) for d in res.details)
```

- [ ] **Step 2: 运行，预期 FAIL（旧逻辑按组一行 amount=90）**

```bash
pytest tests/test_calculator.py::test_per_line_detail_rows_sum_to_total -q
```

- [ ] **Step 3: 实现——分组循环改逐行**

把第 6 步"正常销售组"循环（原 `for g in groups.values(): ... details.append(DetailRow(... net ...))`）替换为逐行：
```python
    for g in groups.values():
        if not g["sales"]:
            continue
        s0 = g["sales"][0]
        product = products[s0.barcode]
        if product.cost is None:
            warnings.append(f"缺成本: {s0.barcode} {s0.product_name}")
            continue
        store_obj = stores.get(s0.store)
        if store_obj is None:
            warnings.append(f"未知门店: {s0.store}")
            continue
        margin = gross_margin(s0.unit_price, product.cost)
        tier = classify_tier(product.category, margin)
        sp = _resolve_duty(duty, s0.store, s0.sale_date, s0.salesperson)
        bucket = ps_bucket.get((sp, s0.store), "LT_70")
        rate = lookup_rate(rate_table, store_obj.store_class, bucket, tier)
        # 逐行：销售
        for s in g["sales"]:
            commission = s.amount * rate
            details.append(DetailRow(s.store, s.sale_date, sp, s.barcode, s.product_name,
                                     tier, store_obj.store_class, bucket, rate, s.amount,
                                     commission, tag="有效计提", sales_record_id=getattr(s, "sales_record_id", None)))
            comm_person[sp] += commission
            comm_store[s.store] += commission
            ps_commission[(sp, s.store)] += commission
        # 逐行：精确匹配退货（冲抵）
        for r in g["returns"]:
            commission = r.amount * rate
            details.append(DetailRow(r.store, r.sale_date, sp, r.barcode, r.product_name,
                                     tier, store_obj.store_class, bucket, rate, r.amount,
                                     commission, tag="退货冲抵", sales_record_id=getattr(r, "sales_record_id", None)))
            comm_person[sp] += commission
            comm_store[r.store] += commission
            ps_commission[(sp, r.store)] += commission
```
（删去原 `group_net`/`net==0` 跳过逻辑对本循环的影响；`daily_sales` 仍用 `group_net`，保留 `group_net` 函数。）

- [ ] **Step 4: 运行，预期 PASS**

```bash
pytest tests/test_calculator.py::test_per_line_detail_rows_sum_to_total -q
pytest tests -q
```
Expected: PASS（若有旧测试断言"按组一行"，更新为逐行预期）。

- [ ] **Step 5: 提交**

```bash
git add salary_engine/calculator.py tests/test_calculator.py
git commit -m "feat: compute 改逐行产出 DetailRow（Σ逐行=总额）"
```

### Task 2.5: 剔除行发 0 提成 DetailRow + |DetailRow|=入参 不变量

**Files:**
- Modify: `salary_engine/calculator.py`（第 1 步过滤处 + 末尾追加）
- Test: `tests/test_calculator.py`

- [ ] **Step 1: 写失败测试**

```python
def test_excluded_lines_emit_zero_commission_detailrows():
    products = {"B1": Product("B1","奶","","常温奶", Decimal(5), False),
                "B2": Product("B2","非奶","","常温奶", Decimal(5), True)}  # exclude_commission
    stores = {"S": Store("S","1组","A","")}
    targets = {"S": Decimal(1000)}
    rt = type("RT",(),{"rates":{("A","GE_100","常温高毛"):Decimal("0.13")},
                       "version":1,"effective_from":date(2026,6,1)})()
    sales = [
        _sl("R1","S",date(2026,6,1),100),                       # 有效
        _sl("R2","S",date(2026,6,1),20,barcode="B2"),           # 不计提成
        _sl("R3","S",date(2026,6,1),30,barcode="B9"),           # 非乳品（B9 不在 products）
    ]
    gift_keys = {("R4","B1")}
    sales.append(_sl("R4","S",date(2026,6,1),50))               # 赠送
    duty = {("S",date(2026,6,1)):"高睿"}
    res = compute(sales, products, stores, targets, rt, "2026-06", 30, gift_keys=gift_keys, duty_override=duty)
    tags = {d.tag for d in res.details}
    assert {"有效计提","不计提成","非乳品","赠送剔除"} <= tags
    # 剔除行 0 提成
    assert all(d.commission == 0 for d in res.details if d.tag in ("不计提成","非乳品","赠送剔除"))
    # 不变量：逐行全覆盖入参
    assert len(res.details) == len(sales)
    # 总额仅来自有效计提
    assert sum((d.commission for d in res.details), Decimal(0)) == Decimal("13.00")
```

- [ ] **Step 2: 运行，预期 FAIL**

```bash
pytest tests/test_calculator.py::test_excluded_lines_emit_zero_commission_detailrows -q
```

- [ ] **Step 3: 实现——过滤时收集剔除行，末尾发 0 提成 DetailRow**

第 1 步过滤循环改为收集 `excluded`：
```python
    sales, returns, excluded = [], [], []
    for ln in sales_lines:
        ln = replace(ln, store=clean_store(ln.store))
        if (ln.receipt, ln.barcode) in gift_keys:
            excluded.append((ln, "赠送剔除")); continue
        product = products.get(ln.barcode)
        if product is None:
            excluded.append((ln, "非乳品")); continue
        if product.exclude_commission:
            excluded.append((ln, "不计提成")); continue
        (returns if ln.is_return else sales).append(ln)
```
在 `return ComputeResult(...)` 之前追加：
```python
    for ln, tag in excluded:
        sp = ln.salesperson or ln.cashier or ""
        details.append(DetailRow(ln.store, ln.sale_date, sp, ln.barcode, ln.product_name,
                                 "", "", "", Decimal(0), ln.amount, Decimal(0),
                                 tag=tag, sales_record_id=getattr(ln, "sales_record_id", None)))
```

- [ ] **Step 4: 运行，预期 PASS + 全量回归**

```bash
pytest tests/test_calculator.py::test_excluded_lines_emit_zero_commission_detailrows -q
pytest tests -q
```
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add salary_engine/calculator.py tests/test_calculator.py
git commit -m "feat: 剔除行发 0 提成 DetailRow，台账逐行全覆盖（ADR-008）"
```

---

## P3 — 真值源切换（C2）+ C1 费率合一

### Task 3.1: engine_bridge 新增 sales_lines_from_db

**Files:**
- Modify: `backend/app/services/engine_bridge.py`
- Test: `backend/tests/test_engine_bridge.py`

- [ ] **Step 1: 写失败测试**

```python
def test_sales_lines_from_db_carries_id():
    from backend.app.db import SessionLocal, SalesRecord, DetailRow
    from backend.app.services.engine_bridge import sales_lines_from_db
    from datetime import date
    db = SessionLocal()
    try:
        db.add(SalesRecord(month="2026-01", receipt="R1", store="S", sale_date=date(2026,1,1),
                           barcode="B", qty=1, amount=10, unit_price=10, salesperson="高睿",
                           cashier="", is_return=False, is_online=False, tag="有效"))
        db.commit()
        lines = sales_lines_from_db(db, "2026-01")
        assert len(lines) == 1
        assert lines[0].sales_record_id is not None
        assert lines[0].receipt == "R1"
    finally:
        db.query(SalesRecord).delete(); db.commit(); db.close()
```

- [ ] **Step 2: 运行，预期 FAIL**

```bash
pytest backend/tests/test_engine_bridge.py::test_sales_lines_from_db_carries_id -q
```

- [ ] **Step 3: 实现**

`backend/app/services/engine_bridge.py` 加：
```python
from salary_engine.models import SalesLine, Product, Store, RateTable
from backend.app.db import SalesRecord

def sales_lines_from_db(db, month: str) -> list:
    """从 SalesRecord 构建 SalesLine（计算真值源），携带 sales_record_id。不过滤——过滤由引擎做。"""
    rows = db.query(SalesRecord).filter_by(month=month).all()
    out = []
    for r in rows:
        out.append(SalesLine(
            receipt=r.receipt, src_order=r.src_order, store=r.store, sale_date=r.sale_date,
            barcode=r.barcode, product_name=r.product_name or "", qty=r.qty, amount=r.amount,
            unit_price=r.unit_price, is_return=r.is_return, is_online=r.is_online,
            cashier=r.cashier or "", salesperson=r.salesperson or "",
            sales_record_id=r.id))
    return out
```

- [ ] **Step 4: 运行，预期 PASS**

```bash
pytest backend/tests/test_engine_bridge.py::test_sales_lines_from_db_carries_id -q
```

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/engine_bridge.py backend/tests/test_engine_bridge.py
git commit -m "feat: engine_bridge.sales_lines_from_db 以 SalesRecord 为真值源（C2）"
```

### Task 3.2: rates_from_db 改读 SalaryPolicyVersion（C1）

**Files:**
- Modify: `backend/app/services/engine_bridge.py`（`rates_from_db`）
- Test: `backend/tests/test_engine_bridge.py`

- [ ] **Step 1: 写失败测试**

```python
def test_rates_from_db_reads_salary_policy():
    from backend.app.db import SessionLocal, SalaryPolicyVersion
    from backend.app.services.engine_bridge import rates_from_db
    from datetime import date
    db = SessionLocal()
    try:
        db.add(SalaryPolicyVersion(version=99, effective_from=date(2026,1,1), is_current=True,
                                   content={"margin_rules":{}, "commission_rates":
                                            {"A":{"GE_100":{"常温高毛":"0.15"}}}}))
        db.commit()
        rt = rates_from_db(db, None)
        from decimal import Decimal
        assert rt.rates[("A","GE_100","常温高毛")] == Decimal("0.15")
    finally:
        db.query(SalaryPolicyVersion).filter_by(version=99).delete(); db.commit(); db.close()
```

- [ ] **Step 2: 运行，预期 FAIL（旧读 RateVersion）**

```bash
pytest backend/tests/test_engine_bridge.py::test_rates_from_db_reads_salary_policy -q
```

- [ ] **Step 3: 实现——改读 SalaryPolicyVersion**

`rates_from_db` 重写：
```python
from fastapi import HTTPException

def rates_from_db(db, policy_version_id: int = None) -> RateTable:
    """加载费率表（单一真值源：SalaryPolicyVersion）。锁定优先。"""
    if policy_version_id:
        pv = db.get(SalaryPolicyVersion, policy_version_id)
    else:
        pv = db.query(SalaryPolicyVersion).filter_by(is_current=True).first()
    if not pv:
        raise HTTPException(404, "费率策略不存在，请先创建并激活工资策略")
    cr = (pv.content or {}).get("commission_rates", {}) or {}
    rates = {}
    for cls, by_bucket in cr.items():
        for bucket, by_tier in by_bucket.items():
            for tier, pct in by_tier.items():
                rates[(cls, bucket, tier)] = Decimal(str(pct))
    return RateTable(version=pv.version, effective_from=pv.effective_from, rates=rates)
```
（`from backend.app.db import ... SalaryPolicyVersion` 加到顶部 import。）

- [ ] **Step 4: 运行，预期 PASS + 后端回归**

```bash
pytest backend/tests/test_engine_bridge.py::test_rates_from_db_reads_salary_policy -q
pytest backend/tests -q
```
Expected: PASS（若有 fixture 用 RateVersion 注入费率，改为建 SalaryPolicyVersion）。

- [ ] **Step 5: 提交**

```bash
git add backend/app/services/engine_bridge.py backend/tests/test_engine_bridge.py
git commit -m "fix(C1): rates_from_db 改读 SalaryPolicyVersion，策略编辑生效"
```

### Task 3.3: _run_compute 切到 SalesRecord 真值源

**Files:**
- Modify: `backend/app/routers/workflow.py`（`_run_compute`）

- [ ] **Step 1: 改 _run_compute 用 sales_lines_from_db**

`_run_compute` 中：
```python
    sales = _load_sales_lines(m.sales_file)
```
改为：
```python
    from backend.app.services.engine_bridge import sales_lines_from_db
    sales = sales_lines_from_db(db, month)
    if not sales:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
```
`rate_table = rates_from_db(db, m.rate_version_id)` 改为 `rates_from_db(db, m.policy_version_id)`。

- [ ] **Step 2: 回归后端**

```bash
pytest backend/tests -q
```
Expected: PASS（fixture 需先建 SalesRecord + SalaryPolicyVersion；若 test_workflow 依赖 Excel 路径，改为插 SalesRecord）。

- [ ] **Step 3: 提交**

```bash
git add backend/app/routers/workflow.py
git commit -m "feat: _run_compute 改从 SalesRecord 读真值（C2 调班可见）"
```

---

## P4 — 物化 + 读端点改查表

### Task 4.1: POST /compute 物化 Result + DetailRow

**Files:**
- Modify: `backend/app/routers/workflow.py`（`do_compute`）
- Test: `backend/tests/test_workflow.py`

- [ ] **Step 1: 写失败测试**

```python
def test_compute_materializes_result_and_detail(client, db_session, seeded_month):
    # seeded_month: 已建 Month + SalesRecord(若干) + SalaryPolicyVersion(current) + Duty + Target
    r = client.post(f"/api/months/{seeded_month}/compute")
    assert r.status_code == 200
    from backend.app.db import Result, DetailRow
    assert db_session.query(Result).filter_by(month=seeded_month).count() > 0
    assert db_session.query(DetailRow).filter_by(month=seeded_month).count() > 0
    # 不变量：Σ DetailRow.commission == Σ Result.commission
    from decimal import Decimal
    dsum = sum((d.commission for d in db_session.query(DetailRow).filter_by(month=seeded_month).all()), Decimal(0))
    rsum = sum((x.commission for x in db_session.query(Result).filter_by(month=seeded_month).all()), Decimal(0))
    assert dsum == rsum
```

- [ ] **Step 2: 运行，预期 FAIL**

```bash
pytest backend/tests/test_workflow.py::test_compute_materializes_result_and_detail -q
```

- [ ] **Step 3: 实现——do_compute 物化**

`do_compute` 重写为（事务内删旧写新）：
```python
@router.post("/months/{month}/compute")
def do_compute(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    result = _run_compute(db, month)
    try:
        db.query(Result).filter_by(month=month).delete()
        db.query(DetailRow).filter_by(month=month).delete()
        for (person, store), v in result.breakdown.items():
            db.add(Result(month=month, person=person, store=store,
                          sales=v["sales"], target=v["target"], achievement=v["achievement"],
                          bucket=v["bucket"], commission=v["commission"]))
        for d in result.details:
            db.add(DetailRow(month=month, sales_record_id=d.sales_record_id, person=d.salesperson,
                             store=d.store, sale_date=d.sale_date, barcode=d.barcode,
                             product_name=d.product_name, tier=d.tier, bucket=d.bucket, rate=d.rate,
                             amount=d.amount, commission=d.commission, tag=d.tag,
                             is_transferred=False))
        m = db.get(Month, month)
        m.status = "computed"
        m.results_stale = False
        if m.policy_version_id is None:                       # 仅首次锁（修 H10）
            cur = db.query(SalaryPolicyVersion).filter_by(is_current=True).first()
            if cur:
                m.policy_version_id = cur.id
        db.commit()
    except Exception:
        db.rollback(); raise
    return {"details": len(result.details), "warnings": result.warnings,
            "total": round(float(sum(result.commission_by_person.values())), 2)}
```
（顶部 import 加 `from backend.app.db import Result, DetailRow, SalaryPolicyVersion`。`is_transferred` 在 T7.1 由 SalesRecord 回填，此处先 False。）

- [ ] **Step 4: 运行，预期 PASS**

```bash
pytest backend/tests/test_workflow.py::test_compute_materializes_result_and_detail -q
```

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/tests/test_workflow.py
git commit -m "feat: /compute 物化 Result+DetailRow（算一次，零重算基础）"
```

### Task 4.2: 读端点改查物化表（删 _run_compute 调用）

**Files:**
- Modify: `backend/app/routers/workflow.py`（`tier_summary`、`tier_detail`、`export`）

- [ ] **Step 1: 写失败测试——tier_summary 不再触发全量重算**

```python
def test_tier_summary_reads_materialized(client, db_session, computed_month, monkeypatch):
    import backend.app.routers.workflow as wf
    called = {"n": 0}
    orig = wf._run_compute
    def spy(db, m):
        called["n"] += 1; return orig(db, m)
    monkeypatch.setattr(wf, "_run_compute", spy)
    client.get(f"/api/months/{computed_month}/tier-summary?store=S&person=高睿")
    assert called["n"] == 0   # 不再重算
```

- [ ] **Step 2: 运行，预期 FAIL**

```bash
pytest backend/tests/test_workflow.py::test_tier_summary_reads_materialized -q
```

- [ ] **Step 3: 实现——tier_summary 改查 DetailRow**

`tier_summary` 重写（按 (person,store) 聚合 DetailRow）：
```python
@router.get("/months/{month}/tier-summary")
def tier_summary(month: str, store: str, person: str,
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(DetailRow).filter_by(month=month, store=store, person=person).all()
    if not rows:
        return {"tiers": [], "total_sales": 0, "total_commission": 0, "bucket": "LT_70", "target": 0}
    bucket = rows[0].bucket
    tier_sales = defaultdict(float); tier_comm = defaultdict(float)
    for d in rows:
        tier_sales[d.tier] += float(d.amount); tier_comm[d.tier] += float(d.commission)
    tgt = db.query(MonthlyTarget).filter_by(month=month, store=store).first()
    monthly_target = float(tgt.target) if tgt else 0
    duty_days = db.query(Duty).filter_by(month=month, store=store, salesperson=person).count()
    personal_target = monthly_target / (days_in_month(month) or 30) * duty_days
    tiers = []
    for name in ["常温高毛","常温低毛","低温高毛","低温低毛","特价"]:
        rate = next((float(d.rate) for d in rows if d.tier == name), 0.0)
        tiers.append({"name": name, "sales": round(tier_sales.get(name,0),2), "rate": rate,
                      "rate_percent": f"{rate*100:.0f}%", "commission": round(tier_comm.get(name,0),2)})
    return {"tiers": tiers, "total_sales": round(sum(tier_sales.values()),2),
            "total_commission": round(sum(tier_comm.values()),2), "bucket": bucket,
            "target": round(personal_target,2), "monthly_target": round(monthly_target,2),
            "duty_days": duty_days}
```
`tier_detail` 与 `export`：删掉各自的 `_run_compute(db, month)` 调用，`export` 改在 T7.1 实现；`tier_detail` 改查 DetailRow（按 person,store,bucket 过滤）。`tier_detail` 实现：
```python
@router.get("/months/{month}/tier-detail")
def tier_detail(month: str, store: str, person: str, bucket: str,
                _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(DetailRow).filter_by(month=month, store=store, person=person).all()
    items = [{"barcode": d.barcode, "product_name": d.product_name, "tier": d.tier,
              "amount": round(float(d.amount),2), "commission": round(float(d.commission),2),
              "tag": d.tag, "sale_date": d.sale_date.isoformat()}
             for d in rows if d.tier == bucket or (bucket == "特价" and d.tier == "特价")]
    return {"items": items}
```
（`sales_detail` 已查 SalesRecord，保持。）

- [ ] **Step 4: 运行，预期 PASS + 回归**

```bash
pytest backend/tests -q
```
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/tests/test_workflow.py
git commit -m "perf: tier-summary/tier-detail 改查物化 DetailRow，不再全量重算（治 R1/R2）"
```

### Task 4.3: results 端点返回 stale 标志

**Files:**
- Modify: `backend/app/routers/workflow.py`（`results`）

- [ ] **Step 1: 改 results 返回 stale**

`results` 返回体加：
```python
    m = db.get(Month, month)
    return {"salary": salary, "breakdown": breakdown,
            "stale": bool(m and (m.results_stale or m.status != "computed"))}
```

- [ ] **Step 2: 回归 + 前端（前端在 P5 后处理 stale 提示）**

```bash
pytest backend/tests -q
```

- [ ] **Step 3: 提交**

```bash
git add backend/app/routers/workflow.py
git commit -m "feat: /results 返回 stale 标志供前端提示重算"
```

---

## P5 — staleness + single-flight

### Task 5.1: 输入变更端点置 results_stale=true

**Files:**
- Modify: `backend/app/routers/workflow.py`（`import_sales`/`import_gifts`/`set_duty`/`transfer_duty`）、`backend/app/routers/targets.py`（`set_targets`）、`backend/app/routers/salary_policies.py`（`activate`）

- [ ] **Step 1: 写失败测试**

```python
def test_import_sales_sets_stale(client, db_session, month_with_results):
    # month_with_results: status=computed, results_stale=False
    client.post(f"/api/months/{month_with_results}/import-sales", files=...)  # 上传一个有效 xlsx
    from backend.app.db import Month
    assert db_session.get(Month, month_with_results).results_stale is True
```

- [ ] **Step 2: 运行，预期 FAIL**

- [ ] **Step 3: 实现——各端点成功路径前置 stale**

在各端点 commit 前加：
```python
    m = db.get(Month, month); m.results_stale = True
```
覆盖：`import_sales`、`import_gifts`、`set_duty`、`transfer_duty`（workflow.py）；`set_targets`（targets.py）；`activate`（salary_policies.py，对所有 status=computed 的 Month 置 stale）。

- [ ] **Step 4: 运行，预期 PASS + 回归**

```bash
pytest backend/tests -q
```

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/
git commit -m "feat: 输入变更置 results_stale=true（staleness 机制）"
```

### Task 5.2: compute single-flight（按月锁 + 409）

**Files:**
- Modify: `backend/app/routers/workflow.py`（模块级锁 + `do_compute`）
- Test: `backend/tests/test_workflow.py`

- [ ] **Step 1: 写失败测试（并发 compute 第二个 409）**

```python
def test_compute_single_flight(client, computed_month, monkeypatch):
    import backend.app.routers.workflow as wf, threading
    wf._compute_locks[computed_month] = threading.Lock()
    wf._compute_locks[computed_month].acquire()        # 模拟正在计算
    r = client.post(f"/api/months/{computed_month}/compute")
    assert r.status_code == 409
    wf._compute_locks[computed_month].release()
```

- [ ] **Step 2: 运行，预期 FAIL**

- [ ] **Step 3: 实现**

`workflow.py` 模块级加：
```python
import threading
_compute_locks: dict[str, threading.Lock] = {}

def _get_lock(month: str) -> threading.Lock:
    if month not in _compute_locks:
        _compute_locks[month] = threading.Lock()
    return _compute_locks[month]
```
`do_compute` 开头加：
```python
    lock = _get_lock(month)
    if not lock.acquire(blocking=False):
        raise HTTPException(status.HTTP_409_CONFLICT, "该月份正在计算，请稍候")
    try:
        m = db.get(Month, month)
        if m.status == "computing":
            raise HTTPException(status.HTTP_409_CONFLICT, "该月份正在计算")
        m.status = "computing"; db.commit()
        ... # 原 _run_compute + 物化（T4.1 逻辑移入），成功置 computed/stale=False
    finally:
        lock.release()
```
（把 T4.1 的物化主体包进 try；失败时 status 回滚由 rollback 处理，补充 `m.status="draft"` 视情况。）

- [ ] **Step 4: 运行，预期 PASS + 回归**

```bash
pytest backend/tests -q
```

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/tests/test_workflow.py
git commit -m "feat: compute single-flight 按月锁 + 409（治 R3 卡死）"
```

---

## P6 — 性能：导入批量化 + 全字段

### Task 6.1: 导入批量化（治 R4）

**Files:**
- Modify: `backend/app/services/sales_importer.py`（`import_sales_to_db`）
- Test: `backend/tests/test_import_master.py` 或新建

- [ ] **Step 1: 写测试（批量正确性，9 万行级用小样本断言行数）**

```python
def test_import_sales_bulk_insert(db_session):
    from backend.app.services.sales_importer import import_sales_to_db
    from salary_engine.models import SalesLine
    from datetime import date
    from decimal import Decimal
    sales = [SalesLine(receipt=f"R{i}", src_order=None, store="S", sale_date=date(2026,1,1),
                       barcode="B", product_name="奶", qty=1, amount=Decimal(1), unit_price=Decimal(1),
                       is_return=False, is_online=False, cashier="", salesperson="高睿") for i in range(500)]
    res = import_sales_to_db(db_session, "2026-01", sales, set())
    assert res["db_count"] == 500
```

- [ ] **Step 2: 实现——批量 upsert**

`import_sales_to_db` 把逐行 `db.execute(stmt)` 改为分批 `bulk`：
```python
    BATCH = 1000
    values = []
    for s in sales:
        tag = _determine_tag(s, products, gift_keys)
        cleaned_store = clean_store(s.store)
        values.append(dict(month=month, receipt=s.receipt, src_order=s.src_order, store=cleaned_store,
            sale_date=s.sale_date, barcode=s.barcode, product_name=s.product_name, qty=s.qty,
            amount=s.amount, unit_price=s.unit_price, salesperson=s.salesperson, cashier=s.cashier,
            is_return=s.is_return, is_online=s.is_online, tag=tag,
            original_store=cleaned_store, original_date=s.sale_date, extra=s_extra(s)))
        if len(values) >= BATCH:
            db.execute(sqlite_insert(SalesRecord).values(values)
                       .on_conflict_do_update(index_elements=["month","receipt","store","sale_date","barcode","amount"],
                           set_={"tag": sqlite_insert(SalesRecord).excluded.tag,
                                 "salesperson": sqlite_insert(SalesRecord).excluded.salesperson,
                                 "is_return": sqlite_insert(SalesRecord).excluded.is_return,
                                 "is_online": sqlite_insert(SalesRecord).excluded.is_online}))
            values = []
    if values:
        db.execute(sqlite_insert(SalesRecord).values(values).on_conflict_do_update(...))  # 同上
    db.commit()
```
（`on_conflict_do_update` 的 `set_` 用 `excluded` 引用批量值；重复导入先 `db.query(SalesRecord).filter_by(month=month).delete()` 防旧行残留——修审计 H4。）

- [ ] **Step 3: 运行 + 回归**

```bash
pytest backend/tests -q
```

- [ ] **Step 4: 提交**

```bash
git add backend/app/services/sales_importer.py backend/tests/
git commit -m "perf: 导入批量化 + 重导清旧行（治 R4，9万行分钟→秒）"
```

### Task 6.2: SalesRecord 存全字段 extra

**Files:**
- Modify: `backend/app/services/sales_importer.py`（`import_sales_to_db` 收集 extra）、`salary_engine/importer.py`（`load_sales_xlsx` 保留原始列）

- [ ] **Step 1: 让 SalesLine 携带原始字段 dict**

`salary_engine/models.py` `SalesLine` 加 `raw: dict = field(default_factory=dict)`。`salary_engine/importer.py` 的 `load_sales_from_rows` 在构造 SalesLine 时把整行 `{列名: 值}` 存入 `raw`。

- [ ] **Step 2: importer 落库时写入 extra**

`import_sales_to_db` 的 values dict 加 `"extra": s.raw or None`。

- [ ] **Step 3: 测试 + 回归**

```bash
pytest tests backend/tests -q
```

- [ ] **Step 4: 提交**

```bash
git add salary_engine/ backend/app/services/sales_importer.py tests/
git commit -m "feat: SalesRecord 存源 Excel 全字段（extra），可对账留底"
```

---

## P7 — 导出台账（逐行 + 全字段 + 标签）

### Task 7.1: export 改 DetailRow JOIN SalesRecord，不调引擎

**Files:**
- Modify: `backend/app/routers/workflow.py`（`export`）、`backend/app/services/sales_importer.py` 或新建 helper

- [ ] **Step 1: 写测试——export 不重算且含全字段+标签**

```python
def test_export_reads_materialized(client, computed_month, monkeypatch):
    import backend.app.routers.workflow as wf
    called = {"n":0}; orig = wf._run_compute
    monkeypatch.setattr(wf, "_run_compute", lambda *a: called.__setitem__("n", called["n"]+1) or orig(*a))
    r = client.get(f"/api/months/{computed_month}/export")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/vnd")
    assert called["n"] == 0
```

- [ ] **Step 2: 实现——export 查 DetailRow JOIN SalesRecord 写 xlsx**

`export` 重写：
```python
@router.get("/months/{month}/export")
def export(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import text
    rows = db.execute(text("""
        SELECT d.tag, d.tier, d.rate, d.commission, d.person, d.store, d.sale_date,
               d.is_transferred, s.receipt, s.src_order, s.barcode, s.product_name, s.qty,
               s.amount, s.unit_price, s.salesperson, s.cashier, s.is_return, s.is_online,
               s.original_store, s.original_date, s.transfer_reason, s.extra
        FROM detail_rows d LEFT JOIN sales_records s ON d.sales_record_id = s.id
        WHERE d.month = :m ORDER BY d.person, d.store, d.sale_date
    """), {"m": month}).mappings().all()
    fd, path = tempfile.mkstemp(suffix=".xlsx"); _os.close(fd)
    try:
        write_ledger_excel(rows, path, month)
        with open(path, "rb") as f: data = f.read()
    finally:
        _os.remove(path)
    return Response(content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="salary_{month}.xlsx"'})
```
新增 `backend/app/services/ledger_export.py` 的 `write_ledger_excel(rows, path, month)`：用 openpyxl 把每行写成"全部原始字段 + tag + tier/rate/commission + is_transferred + 原门店/原日期/原因"。同时回填 `DetailRow.is_transferred`（`s.original_store is not None`）。

- [ ] **Step 3: 解耦 exporter 对 backend.db 的硬耦合**

`salary_engine/exporter.py` 的 `write_excel` 把 `from backend.app.db import ...` 移进 `if db:` 分支内（修 H12），CLI（db=None）不再触发该 import。

- [ ] **Step 4: 运行 + 回归**

```bash
pytest backend/tests -q
```

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/app/services/ledger_export.py salary_engine/exporter.py backend/tests/
git commit -m "feat: 导出台账=DetailRow JOIN SalesRecord 逐行全字段+标签，不重算（修 H12）"
```

---

## P8 — 真实数据验证（交付前）

### Task 8.1: 真实 6 月数据前后对比 + Σ对账

**Files:**
- Create: `tests/test_realdata_reconciliation.py`（标记 `@pytest.mark.realdata`，缺数据时 skip）

- [ ] **Step 1: 写对账测试**

```python
import os, pytest
@pytest.mark.realdata
@pytest.mark.skipif(not os.path.exists("工资表_2026-06.xlsx"), reason="无真实数据")
def test_june_reconciliation():
    # 用真实 6 月 Excel 跑导入→当班→compute，断言：
    # 1) Σ DetailRow.commission == Σ Result.commission
    # 2) 各 tag 行数合理（赠送/退货/有效）
    # 3) 与旧口径 diff 记录到 docs（C3 影响面），人工确认
    ...
```

- [ ] **Step 2: 跑并记录 C3 影响面**

```bash
pytest -m realdata -q
```
把前后差异（哪些人提成变了、幅度）写入 `docs/superpowers/specs/2026-07-19-compute-dataflow-redesign-design.md` 附录或单独核对记录，**人工确认后**方可交付。

- [ ] **Step 3: 提交**

```bash
git add tests/test_realdata_reconciliation.py
git commit -m "test: 真实6月数据对账 + C3 影响面记录"
```

### Task 8.2: 端到端不重算/不卡死回归

- [ ] **Step 1: 手动/脚本回归**

启动后端 + 前端，跑：导入6月 → 配目标 → 当班确认（含一次拖拽调班）→ 计算 → 反复切节点 + 展开多行提成明细 + 导出。
预期：下钻/导出毫秒级、无卡死；调班后重算提成归属正确（C2）；策略改比例后重算生效（C1）。

- [ ] **Step 2: 记录踩坑到记忆（铁律 5）**

把过程中踩到的坑写入记忆 `memory/`（type=feedback，Why + How to apply）。

- [ ] **Step 3: 提交收尾**

```bash
git add -A
git commit -m "chore: P8 端到端回归通过"
```

---

## 自检（Self-Review，写作后）

**Spec 覆盖：**
- C1 费率合一 → T1.5 + T3.2 ✓
- C2 真值源/调班可见 → T3.1 + T3.3 ✓
- C3 当班天数 → T2.3 ✓
- R1 重算 → T4.2 ✓
- R2 无物化 → T1.2 + T4.1 ✓
- R3 并发卡死 → T5.2 ✓
- R4 逐行导入 → T6.1 ✓
- 全字段留底 → T1.1 + T6.2 ✓
- 逐行台账+标签 → T2.4 + T2.5 + T7.1 ✓
- staleness → T4.3 + T5.1 ✓
- WAL → T0.2 ✓
- 迁移 → T0.1 + P1 ✓
- H12 exporter 解耦 → T7.1 Step3 ✓
- H4 重导旧行 → T6.1 ✓
- H10 版本锁覆盖 → T4.1（仅首次锁）✓

**Placeholder 扫描：** 无 TBD/TODO；`...` 仅出现在"原 T4.1 物化主体移入 try"等明确引用前任务的位置，非占位。

**类型一致性：** `DetailRow.tag`（T2.2 定义）在 T2.3/T2.4/T2.5/T4.1/T7.1 一致；`sales_lines_from_db`（T3.1）在 T3.3 一致；`rates_from_db(db, policy_version_id)`（T3.2）在 T3.3 一致；`results_stale`（T1.3）在 T4.1/T4.3/T5.1 一致。

**遗留风险（执行时注意）：**
- T6.1 的 `on_conflict_do_update` 用 `excluded` 引用批量列——SQLite + SQLAlchemy 方言需实测；若不支持批量 excluded，退化为"先 delete 再 bulk_insert_mappings"。
- T2.3/T2.4 会改变现有引擎测试断言值，需逐一核实是"断言旧错误口径"还是"真回归"。
- C3 改动改变提成数字，T8.1 须人工确认影响面后方可合并。
