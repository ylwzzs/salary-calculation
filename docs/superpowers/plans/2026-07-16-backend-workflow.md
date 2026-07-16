# Web 后端月度流程 Implementation Plan (Plan 2b / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 给后端补上月度工作流的 API：建月（复制上月目标）、导入销售/让利、当班推断+确认、一键计算（复用引擎）、结果查询与 Excel 导出。完成后后端 API 齐全，可驱动前端。

**Architecture:** 销售/让利以上传**文件**形式挂在 Month 上，计算时用 `salary_engine.importer` 重解析（不把9万行存DB）。DB 新增 `Month`/`Duty`/`Result` 三表。新增 `engine_bridge` service 把 DB 主数据/比例表/目标/当班 桥接成引擎所需对象，调 `salary_engine.calculator.compute`。

**Tech Stack:** 复用 2a（FastAPI/SQLAlchemy/SQLite），加 `calendar`（算当月天数）。引擎对象见 `salary_engine.models`。

**对应规格：** §6 月度工作流、§7 步骤、§2 业务规则（已由引擎实现）。

---

## File Structure（新增/修改）

```
backend/app/
├── db.py                       # 修改：加 Month / Duty / Result 模型
├── services/
│   └── engine_bridge.py        # 新：DB↔引擎对象桥接 + days_in_month
├── routers/
│   ├── months.py               # 新：建月/列表/详情
│   ├── workflow.py             # 新：导入销售让利、当班推断+确认、计算、结果、导出
└── tests/
    ├── test_engine_bridge.py
    ├── test_months.py
    └── test_workflow.py
```

`engine_bridge.py` 单一职责：DB → 引擎对象。`workflow.py` 一个 router 装月度流程端点（导入/当班/计算/结果/导出），按月份路由。

---

## Task 1: DB 模型(Month/Duty/Result) + 引擎桥接 service

**Files:**
- Modify: `backend/app/db.py`（追加 3 个模型）
- Create: `backend/app/services/engine_bridge.py`
- Test: `backend/tests/test_engine_bridge.py`

- [ ] **Step 1: 追加到 `backend/app/db.py`（不要动已有模型）**

```python
class Month(Base):
    __tablename__ = "months"
    month = Column(String, primary_key=True)     # YYYY-MM
    status = Column(String, default="draft")     # draft | computed
    sales_file = Column(String, nullable=True)   # 上传的销售流水路径
    gifts_file = Column(String, nullable=True)   # 上传的让利明细路径
    rate_version_id = Column(Integer, nullable=True)  # 计算时锁定的比例表版本
    created_at = Column(DateTime, default=datetime.utcnow)


class Duty(Base):
    __tablename__ = "duties"
    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)
    store = Column(String, nullable=False)
    duty_date = Column(Date, nullable=False)
    salesperson = Column(String, nullable=False)  # 确认的当班人
    __table_args__ = (UniqueConstraint("month", "store", "duty_date", name="uq_duty"),)


class Result(Base):
    __tablename__ = "results"
    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)
    person = Column(String, nullable=False)
    store = Column(String, nullable=False)
    sales = Column(Numeric, nullable=False)
    target = Column(Numeric, nullable=False)
    achievement = Column(Numeric, nullable=False)
    bucket = Column(String, nullable=False)
    commission = Column(Numeric, nullable=False)
    __table_args__ = (UniqueConstraint("month", "person", "store", name="uq_result"),)
```

- [ ] **Step 2: 写失败测试 `backend/tests/test_engine_bridge.py`**

```python
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from backend.app.db import Base, Product, Store, MonthlyTarget, RateVersion, Duty
from backend.app.services.engine_bridge import (
    rates_from_db, products_from_db, stores_from_db, targets_from_db,
    duty_override_from_db, days_in_month,
)


def _db():
    from sqlalchemy import create_engine
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return Session(eng)


def test_days_in_month():
    assert days_in_month("2026-06") == 30
    assert days_in_month("2024-02") == 29  # 闰年


def test_rates_roundtrip():
    s = _db()
    rt = {"A": {"GE_100": {"低温高毛": "0.13"}}}
    s.add(RateVersion(version=1, effective_from=date(2026, 6, 1), is_current=True, rates=rt))
    s.commit()
    table = rates_from_db(s)
    assert table.rates[("A", "GE_100", "低温高毛")] == Decimal("0.13")


def test_products_and_targets_bridge():
    s = _db()
    s.add(Product(barcode="6920001", name="低温奶", spec="200ml", category="低温奶", cost=2))
    s.add(Store(name="福景店", group="1组", store_class="A", supervisor="胡总"))
    s.add(MonthlyTarget(month="2026-06", store="福景店", target=84000))
    s.commit()
    p = products_from_db(s)
    assert p["6920001"].cost == 2 and p["6920001"].category == "低温奶"
    st = stores_from_db(s)
    assert st["福景店"].store_class == "A"
    tg = targets_from_db(s, "2026-06")
    assert tg["福景店"] == 84000


def test_duty_override_bridge():
    s = _db()
    s.add(Duty(month="2026-06", store="福景店", duty_date=date(2026, 6, 1), salesperson="高睿"))
    s.commit()
    ov = duty_override_from_db(s, "2026-06")
    assert ov[("福景店", date(2026, 6, 1))] == "高睿"
```

- [ ] **Step 3: 运行验证失败**

Run: `pytest backend/tests/test_engine_bridge.py -q`
Expected: FAIL（ModuleNotFoundError）

- [ ] **Step 4: 写实现 `backend/app/services/engine_bridge.py`**

```python
"""DB 数据 → salary_engine 对象的桥接（计算前组装引擎入参）。"""
import calendar
from datetime import date
from decimal import Decimal

from salary_engine.models import Product, Store, RateTable
from backend.app.db import Product as ProductRow, Store as StoreRow
from backend.app.db import MonthlyTarget, RateVersion, Duty


def days_in_month(month: str) -> int:
    y, m = map(int, month.split("-"))
    return calendar.monthrange(y, m)[1]


def rates_from_db(db) -> RateTable:
    rv = db.query(RateVersion).filter_by(is_current=True).first()
    rates = {}
    for cls, by_bucket in (rv.rates or {}).items():
        for bucket, by_tier in by_bucket.items():
            for tier, pct in by_tier.items():
                rates[(cls, bucket, tier)] = Decimal(str(pct))
    return RateTable(version=rv.version, effective_from=rv.effective_from, rates=rates)


def products_from_db(db) -> dict:
    return {r.barcode: Product(r.barcode, r.name, r.spec, r.category,
                               Decimal(r.cost) if r.cost is not None else None)
            for r in db.query(ProductRow).all()}


def stores_from_db(db) -> dict:
    return {r.name: Store(r.name, r.group, r.store_class, r.supervisor or "")
            for r in db.query(StoreRow).all()}


def targets_from_db(db, month: str) -> dict:
    return {r.store: Decimal(r.target)
            for r in db.query(MonthlyTarget).filter_by(month=month).all()}


def duty_override_from_db(db, month: str) -> dict:
    return {(r.store, r.duty_date): r.salesperson
            for r in db.query(Duty).filter_by(month=month).all()}
```

- [ ] **Step 5: 运行验证通过**

Run: `pytest backend/tests/test_engine_bridge.py -q`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/db.py backend/app/services/engine_bridge.py backend/tests/test_engine_bridge.py
git commit -m "feat(backend): Month/Duty/Result 模型 + 引擎桥接 service"
```

---

## Task 2: 月度管理 API（建月复制上月目标）

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/months.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_months.py`

- [ ] **Step 1: 写失败测试 `backend/tests/test_months.py`**

```python
def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_create_month_and_copy_targets(client):
    h = auth_header(client)
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    client.put("/months/2026-06/targets", headers=h, json={"items": [{"store": "福景店", "target": "84000"}]})
    # 建 7 月，复制 6 月目标
    r = client.post("/months", headers=h, json={"month": "2026-07", "copy_from": "2026-06"})
    assert r.status_code == 200
    tg = client.get("/months/2026-07/targets", headers=h).json()
    assert tg["2026-07"]["福景店"] == 84000


def test_list_months(client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    r = client.get("/months", headers=h)
    assert r.status_code == 200
    assert any(m["month"] == "2026-06" for m in r.json())
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_months.py -q`
Expected: FAIL

- [ ] **Step 3: 追加到 `backend/app/schemas.py`**

```python
class MonthOut(BaseModel):
    month: str
    status: str | None = None
    sales_file: str | None = None
    gifts_file: str | None = None
    rate_version_id: int | None = None

    class Config:
        from_attributes = True


class MonthCreate(BaseModel):
    month: str
    copy_from: str | None = None
```

- [ ] **Step 4: 建 `backend/app/routers/months.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.db import get_db, Month, MonthlyTarget, User
from backend.app.schemas import MonthOut, MonthCreate

router = APIRouter(prefix="/months", tags=["months"])


@router.post("", response_model=MonthOut)
def create_month(body: MonthCreate,
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    if db.get(Month, body.month):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "月份已存在")
    m = Month(month=body.month)
    db.add(m)
    if body.copy_from:
        src = db.query(MonthlyTarget).filter_by(month=body.copy_from).all()
        for t in src:
            db.add(MonthlyTarget(month=body.month, store=t.store, target=t.target))
    db.commit()
    db.refresh(m)
    return m


@router.get("", response_model=list[MonthOut])
def list_months(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(Month).order_by(Month.month.desc()).all()


@router.get("/{month}", response_model=MonthOut)
def get_month(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(Month, month)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")
    return m
```

- [ ] **Step 5: `main.py` 挂载**

```python
from backend.app.routers import months as months_router
app.include_router(months_router.router)
```

- [ ] **Step 6: 运行验证通过**

Run: `pytest backend/tests/test_months.py -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add backend/app/schemas.py backend/app/routers/months.py backend/app/main.py backend/tests/test_months.py
git commit -m "feat(backend): 月度管理 API（建月复制上月目标）"
```

---

## Task 3: 销售/让利导入 API

**Files:**
- Modify: `backend/app/routers/workflow.py`（新建）
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_workflow.py`（新建，本任务先写导入部分）

> 上传文件保存到 `uploads/{month}/`，路径记到 Month.sales_file / gifts_file。

- [ ] **Step 1: 写失败测试 `backend/tests/test_workflow.py`**

```python
import openpyxl


def auth_header(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def _sales_xlsx(path):
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["序号", "机构名称", "小票单号", "销售时间", "上传时间", "销售方式", "商品编码",
               "收银员名称", "国际条码", "数量", "销售金额", "销售单价", "商品名称",
               "订单渠道", "源单号"])
    ws.append(["1", "福景店", "R001", "2026-06-01 10:00", "", "销售", "", "高睿",
               "6920001", "1", "3", "3", "低温奶", "线下", ""])
    wb.save(path)


def test_import_sales_and_gifts(tmp_path, client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    s = tmp_path / "sales.xlsx"; _sales_xlsx(s)
    with open(s, "rb") as f:
        r = client.post("/months/2026-06/import-sales", headers=h,
                        files={"file": ("sales.xlsx", f)})
    assert r.status_code == 200
    m = client.get("/months/2026-06", headers=h).json()
    assert m["sales_file"] and m["sales_file"].endswith(".xlsx")
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_workflow.py -q`
Expected: FAIL

- [ ] **Step 3: 建 `backend/app/routers/workflow.py`（导入部分）**

```python
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from backend.app.auth import current_user
from backend.app.config import BASE_DIR
from backend.app.db import get_db, Month, User

router = APIRouter(tags=["workflow"])
UPLOAD_DIR = BASE_DIR / "uploads"


def _save_upload(month: str, f: UploadFile, kind: str) -> str:
    suffix = os.path.splitext(f.filename or "u.xlsx")[1] or ".xlsx"
    d = UPLOAD_DIR / month
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{kind}{suffix}"
    with open(path, "wb") as out:
        out.write(f.file.read())
    return str(path)


def _get_month(db, month) -> Month:
    m = db.get(Month, month)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "月份不存在")
    return m


@router.post("/months/{month}/import-sales")
def import_sales(month: str, file: UploadFile = File(...),
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    m.sales_file = _save_upload(month, file, "sales")
    db.commit()
    return {"sales_file": m.sales_file}


@router.post("/months/{month}/import-gifts")
def import_gifts(month: str, file: UploadFile = File(...),
                 _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    m.gifts_file = _save_upload(month, file, "gifts")
    db.commit()
    return {"gifts_file": m.gifts_file}
```

- [ ] **Step 4: `main.py` 挂载**

```python
from backend.app.routers import workflow as workflow_router
app.include_router(workflow_router.router)
```

- [ ] **Step 5: 运行验证通过**

Run: `pytest backend/tests/test_workflow.py -q`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/app/routers/workflow.py backend/app/main.py backend/tests/test_workflow.py
git commit -m "feat(backend): 销售/让利导入 API"
```

---

## Task 4: 当班推断与确认 API

**Files:**
- Modify: `backend/app/routers/workflow.py`（追加当班端点）
- Modify: `backend/tests/test_workflow.py`（追加当班测试）

> 推断：重解析销售流水 → `infer_duty` → 返回 `{store: {date: 人名|[多人]}}`（多人列出供前端处理）。确认：把确认的 (store,date,salesperson) 写入 Duty 表（覆盖该月）。

- [ ] **Step 1: 追加测试到 `backend/tests/test_workflow.py`**

```python
def test_infer_and_confirm_duty(tmp_path, client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    s = tmp_path / "sales.xlsx"; _sales_xlsx(s)
    with open(s, "rb") as f:
        client.post("/months/2026-06/import-sales", headers=h, files={"file": ("sales.xlsx", f)})
    grid = client.post("/months/2026-06/infer-duty", headers=h).json()
    assert "福景店" in grid and "2026-06-01" in grid["福景店"]
    # 确认
    r = client.put("/months/2026-06/duty", headers=h, json={
        "items": [{"store": "福景店", "date": "2026-06-01", "salesperson": "高睿"}]})
    assert r.status_code == 200
    got = client.get("/months/2026-06/duty", headers=h).json()
    assert got["福景店"]["2026-06-01"] == "高睿"
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_workflow.py::test_infer_and_confirm_duty -q`
Expected: FAIL

- [ ] **Step 3: 追加到 `backend/app/routers/workflow.py`**

```python
from datetime import date as date_type
from pydantic import BaseModel
from salary_engine.importer import load_sales_xlsx
from salary_engine.calculator import clean_store
from salary_engine.onduty import infer_duty
from salary_engine.models import SalesLine
from dataclasses import replace
from backend.app.db import Duty


class DutyItem(BaseModel):
    store: str
    date: str          # YYYY-MM-DD
    salesperson: str


class DutyBatch(BaseModel):
    items: list[DutyItem]


def _load_sales_lines(path: str):
    raw = load_sales_xlsx(path)
    return [replace(s, store=clean_store(s.store)) for s in raw]


@router.post("/months/{month}/infer-duty")
def infer(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get_month(db, month)
    if not m.sales_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
    duty = infer_duty([s for s in _load_sales_lines(m.sales_file) if not s.is_return])
    grid = {}
    for (store, d), p in duty.items():
        ds = d.isoformat() if hasattr(d, "isoformat") else str(d)
        grid.setdefault(store, {})[ds] = p if isinstance(p, str) else list(p)
    return grid


@router.put("/months/{month}/duty")
def set_duty(month: str, body: DutyBatch,
             _: User = Depends(current_user), db: Session = Depends(get_db)):
    _get_month(db, month)
    db.query(Duty).filter_by(month=month).delete()
    for it in body.items:
        db.add(Duty(month=month, store=it.store,
                    duty_date=date_type.fromisoformat(it.date), salesperson=it.salesperson))
    db.commit()
    return {"saved": len(body.items)}


@router.get("/months/{month}/duty")
def get_duty(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Duty).filter_by(month=month).all()
    grid = {}
    for r in rows:
        grid.setdefault(r.store, {})[r.duty_date.isoformat()] = r.salesperson
    return grid
```

- [ ] **Step 4: 运行验证通过**

Run: `pytest backend/tests/test_workflow.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/tests/test_workflow.py
git commit -m "feat(backend): 当班推断与确认 API"
```

---

## Task 5: 计算 API（复用引擎）

**Files:**
- Modify: `backend/app/routers/workflow.py`（追加 compute）
- Modify: `backend/tests/test_workflow.py`（追加 compute→result 测试）

> 组装引擎入参(主数据/比例表/目标/当班/销售/让利/天数) → `compute` → 清空该月 Result 后写入，并把 Month.status=computed、锁定当前 rate_version_id。

- [ ] **Step 1: 追加测试到 `backend/tests/test_workflow.py`**

```python
def test_compute_and_result(tmp_path, client):
    h = auth_header(client)
    client.post("/months", headers=h, json={"month": "2026-06"})
    client.put("/stores/福景店", headers=h, json={"name": "福景店", "group": "1组", "store_class": "A"})
    client.put("/products/6920001", headers=h, json={
        "barcode": "6920001", "name": "低温奶", "spec": "200ml", "category": "低温奶", "cost": "2"})
    client.put("/months/2026-06/targets", headers=h, json={"items": [{"store": "福景店", "target": "3"}]})
    s = tmp_path / "sales.xlsx"; _sales_xlsx(s)
    with open(s, "rb") as f:
        client.post("/months/2026-06/import-sales", headers=h, files={"file": ("sales.xlsx", f)})
    client.post("/months/2026-06/infer-duty", headers=h)
    client.put("/months/2026-06/duty", headers=h, json={
        "items": [{"store": "福景店", "date": "2026-06-01", "salesperson": "高睿"}]})
    r = client.post("/months/2026-06/compute", headers=h)
    assert r.status_code == 200
    res = client.get("/months/2026-06/results", headers=h).json()
    # 目标3/天0.1，卖3→达成3000%→GE_100；A低温高毛(单价3成本2=33%>15%)13%→0.39
    assert any(x["person"] == "高睿" and abs(x["commission"] - 0.39) < 0.01 for x in res["salary"])
```

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_workflow.py::test_compute_and_result -q`
Expected: FAIL

- [ ] **Step 3: 追加到 `backend/app/routers/workflow.py`**

```python
from decimal import Decimal
from salary_engine.importer import load_gift_keys_xlsx
from salary_engine.calculator import compute
from backend.app.services.engine_bridge import (
    rates_from_db, products_from_db, stores_from_db, targets_from_db,
    duty_override_from_db, days_in_month,
)
from backend.app.db import Result, RateVersion


def _run_compute(db, month: str):
    m = _get_month(db, month)
    if not m.sales_file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "尚未导入销售流水")
    sales = _load_sales_lines(m.sales_file)
    gifts = load_gift_keys_xlsx(m.gifts_file) if m.gifts_file else set()
    result = compute(
        sales_lines=sales,
        products=products_from_db(db),
        stores=stores_from_db(db),
        targets=targets_from_db(db, month),
        rate_table=rates_from_db(db),
        month=month, days=days_in_month(month),
        gift_keys=gifts,
        duty_override=duty_override_from_db(db, month),
    )
    return result


@router.post("/months/{month}/compute")
def do_compute(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    result = _run_compute(db, month)
    db.query(Result).filter_by(month=month).delete()
    for (person, store), v in result.breakdown.items():
        db.add(Result(month=month, person=person, store=store,
                      sales=v["sales"], target=v["target"], achievement=v["achievement"],
                      bucket=v["bucket"], commission=v["commission"]))
    m = db.get(Month, month)
    m.status = "computed"
    cur = db.query(RateVersion).filter_by(is_current=True).first()
    if cur:
        m.rate_version_id = cur.id
    db.commit()
    return {"details": len(result.details), "warnings": result.warnings,
            "total": float(sum(result.commission_by_person.values()))}
```

- [ ] **Step 4: 运行验证通过**

Run: `pytest backend/tests/test_workflow.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/tests/test_workflow.py
git commit -m "feat(backend): 计算 API（复用引擎，锁定比例表版本）"
```

---

## Task 6: 结果查询与 Excel 导出 API

**Files:**
- Modify: `backend/app/routers/workflow.py`（追加 results / export）
- Modify: `backend/tests/test_workflow.py`（追加 results 测试）

> 结果查询：从 Result 表汇总工资表(按人) + 明细(按人×店)。导出：重跑 `_run_compute` 得到完整 ComputeResult，用 `salary_engine.exporter.write_excel` 写临时文件返回。

- [ ] **Step 1: 追加测试到 `backend/tests/test_workflow.py`**

```python
def test_results_and_export(tmp_path, client):
    h = auth_header(client)
    test_compute_and_result(tmp_path, client)  # 复用：已算好 2026-06
    res = client.get("/months/2026-06/results", headers=h).json()
    assert res["salary"] and res["breakdown"]
    exp = client.get("/months/2026-06/export", headers=h)
    assert exp.status_code == 200
    assert "spreadsheet" in exp.headers.get("content-type", "") or exp.headers.get("content-type","").startswith("application/vnd")
```

> 注：`test_results_and_export` 调用 `test_compute_and_result(tmp_path, client)` 复用其建数据流程（pytest 不会把它当独立测试再跑一遍去重——它就是一个普通函数调用）。

- [ ] **Step 2: 运行验证失败**

Run: `pytest backend/tests/test_workflow.py::test_results_and_export -q`
Expected: FAIL

- [ ] **Step 3: 追加到 `backend/app/routers/workflow.py`**

```python
import tempfile
from collections import defaultdict
from fastapi import Response
from salary_engine.exporter import write_excel
from salary_engine.calculator import ComputeResult, DetailRow


@router.get("/months/{month}/results")
def results(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Result).filter_by(month=month).all()
    salary = defaultdict(Decimal)
    breakdown = []
    for r in rows:
        salary[r.person] += r.commission
        breakdown.append({"person": r.person, "store": r.store,
                          "sales": float(r.sales), "target": float(r.target),
                          "achievement": float(r.achievement), "bucket": r.bucket,
                          "commission": float(r.commission)})
    salary = sorted(({"person": p, "commission": float(c)} for p, c in salary.items()),
                    key=lambda x: x["commission"], reverse=True)
    return {"salary": salary, "breakdown": breakdown}


@router.get("/months/{month}/export")
def export(month: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    result = _run_compute(db, month)   # 重跑得到完整明细
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    import os as _os
    _os.close(fd)
    write_excel(result, path)
    data = open(path, "rb").read()
    _os.remove(path)
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="salary_{month}.xlsx"'})
```

- [ ] **Step 4: 运行全部测试**

Run: `pytest -q`
Expected: 全部 PASS（engine + backend）

- [ ] **Step 5: 提交**

```bash
git add backend/app/routers/workflow.py backend/tests/test_workflow.py
git commit -m "feat(backend): 结果查询与 Excel 导出 API"
```

---

## Self-Review（计划自审，已核对）

**1. 规格覆盖：** §7 步骤①建月(Task2)②导入销售让利(Task3)③当班确认(Task4)④计算(Task5)⑤结果/导出(Task6) ✓；§2 计算复用引擎(Task5 `_run_compute`) ✓；§2.4 按「人×店」达成 → 引擎已实现，后端只组装入参 ✓；比例表锁定版本(Task5 rate_version_id) ✓；§2.5 当班推断+确认(Task4) ✓。
**2. 占位扫描：** 无 TODO/TBD；每任务有完整测试与实现。
**3. 类型一致：** Duty.duty_date(Date)，API 用 ISO 字符串互转；Result 各 Numeric 字段 ↔ Decimal；breakdown 键 (person,store) 与引擎 `ComputeResult.breakdown` 一致；`_load_sales_lines` 复用 Task4 定义（Task5/6 引用，顺序已排好）。
**4. 复用引擎：** importer.load_sales_xlsx/load_gift_keys_xlsx、onduty.infer_duty、calculator.compute+clean_store、exporter.write_excel、engine_bridge 重组 RateTable——不重写业务逻辑。

---

## 执行交接

Plan 2b 完成后，后端 API **齐全**（登录+主数据+月度全流程），可用 `uvicorn backend.app.main:app` 起服务、跑通完整月度计算。之后：
- **Plan 3 · Web 前端**：React 四屏（主数据 / 月度工作台 / 当班网格拖拽 / 结果看板），消费 2a+2b 全部 API。

执行方式：沿用**子代理驱动**。
