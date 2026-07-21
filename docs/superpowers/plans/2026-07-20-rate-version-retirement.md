# RateVersion 停用（H2 / ADR-006 落地）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 superpowers:executing-plans 按 task 执行。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 停用 DB 层 RateVersion（单一真值源 SalaryPolicyVersion），消除第二费率入口；物理表/列保留（零生产迁移风险）。

**Architecture:** ADR-006 已确认"废弃 RateVersion，迁移后停用"。本轮做停用落地：删 `/rate-versions` router、main 启动 seed 改为 SalaryPolicyVersion（新库首启即有 policy，compute 不再 404）、删 exporter 死代码 db 分支（顺带修 H12 对 backend.db 的硬耦合）、删 ORM 的 RateVersion 模型与 Month.rate_version_id 列定义（物理表/列保留不动）、清 schemas/conftest/test 的 RateVersion 引用、frontend 删字段。**引擎层 `salary_engine/rates.py` 的 `seed_rate_table` 函数保留**（它是引擎种子 RateTable 的纯函数，CLI 与引擎测试用，与 DB RateVersion 同名但无关）。

**Tech Stack:** FastAPI、SQLAlchemy 2、pytest（后端）；React/TS（前端）。

**Global Constraints:**
- 物理表 `rate_versions` 与列 `months.rate_version_id` **保留**（不 drop，零生产迁移风险；ORM 不再映射即自然废弃）
- `salary_engine/rates.py` 的 `seed_rate_table` 函数 + `cli.py` + 引擎测试里的 `seed_rate_table()` **保留**
- `backend/scripts/migrate_rates_to_policy.py` + `alembic/versions/189805f8dadd_*` **保留**（历史数据迁移，idempotent）
- 每个 task 结束 `git commit`；测试命令 `uv run pytest -q`
- 百分数约定（ADR-009）：SalaryPolicyVersion.content.commission_rates 存百分数（如 "13"），engine_bridge.rates_from_db 边界 ÷100

---

## File Structure

| 文件 | 改动 |
|---|---|
| `backend/app/main.py` | `seed_rate_table` 改为 `seed_salary_policy`（种 SalaryPolicyVersion）；删 rates router include |
| `backend/app/routers/rates.py` | **删整个文件** |
| `backend/app/db.py` | 删 `RateVersion` 模型；删 `Month.rate_version_id` 列定义（物理列保留） |
| `backend/app/schemas.py` | 删 `RateVersionOut`/`RateVersionCreate`；删 `MonthOut.rate_version_id` |
| `salary_engine/exporter.py` | 删 `write_excel` 的 `if db:` 分支（死代码 + 修 H12） |
| `backend/tests/conftest.py` | `_seed` 改为种 SalaryPolicyVersion |
| `backend/tests/test_rates.py` | **删整个文件**（测 legacy `/rate-versions` 端点） |
| `backend/tests/test_db.py` | 删 `RateVersion` import |
| `backend/tests/test_engine_bridge.py` | 删 `RateVersion` import；`test_rates_roundtrip` 改用 SalaryPolicyVersion |
| `frontend/src/api.ts` | 删 `MonthInfo.rate_version_id` |

---

## Task 1: main.py seed 改 SalaryPolicyVersion + 删 rates router include

**Files:** Modify `backend/app/main.py`

**Interfaces:**
- Produces: `seed_salary_policy()` —— 新库首启若无 SalaryPolicyVersion 则种 v1（来自引擎种子，百分数）

- [ ] **Step 1: 改 main.py 的 seed 函数**

把 `backend/app/main.py:26-44` 的 `def seed_rate_table()` 整段替换为：

```python
def seed_salary_policy():
    """首启若无 SalaryPolicyVersion，种 v1（单一真值源，ADR-006/009）。
    内容来自引擎种子 seed_rate_table：commission_rates 存百分数（÷100 在 engine_bridge 边界）。"""
    from backend.app.db import SessionLocal, SalaryPolicyVersion
    from salary_engine.rates import seed_rate_table as _seed
    db = SessionLocal()
    try:
        if not db.query(SalaryPolicyVersion).first():
            rt = _seed()
            cr = {}
            for (cls, bucket, tier), frac in rt.rates.items():
                cr.setdefault(cls, {}).setdefault(bucket, {})[tier] = str(int(frac * 100))
            db.add(SalaryPolicyVersion(
                version=1, effective_from=rt.effective_from, is_current=True,
                content={"margin_rules": {}, "commission_rates": cr},
                note="首启种子（来自引擎 seed_rate_table）", created_by="system"))
            db.commit()
    finally:
        db.close()


seed_salary_policy()
```

- [ ] **Step 2: 删 rates router 的 include**

删 `backend/app/main.py` 里这两行：

```python
from backend.app.routers import rates as rates_router
app.include_router(rates_router.router)
```

- [ ] **Step 3: 跑全量确认绿**

Run: `uv run pytest -q`
Expected: 全绿（backend/tests/test_rates.py 还在但下个 task 删；若它因 router 没了而 fail，先在 Task 2 删它再跑）

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "refactor(main): seed 改 SalaryPolicyVersion + 删 rates router include（H2）"
```

---

## Task 2: 删 rates router + legacy 测试

**Files:** Delete `backend/app/routers/rates.py`、`backend/tests/test_rates.py`

- [ ] **Step 1: 删文件**

```bash
git rm backend/app/routers/rates.py backend/tests/test_rates.py
```

- [ ] **Step 2: 跑全量确认绿**

Run: `uv run pytest -q`
Expected: 全绿（无 /rate-versions 测试了）

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: 删 RateVersion router 与 legacy 测试（H2/ADR-006 停用）"
```

---

## Task 3: 删 exporter.py 死代码 db 分支（修 H12）

**Files:** Modify `salary_engine/exporter.py`

> exporter.write_excel 的 `if db:` 分支读 RateVersion，但 Web 导出走 ledger_export、CLI 走 db=None，该分支不可达（死代码），且对 backend.db 硬耦合（H12）。删之，exporter 纯 CLI。

- [ ] **Step 1: 简化 write_excel，删 db 分支与 backend.db 依赖**

把 `write_excel` 改为只保留 CLI 路径（db 参数移除）。删除：`if db:` 整块（含 `from backend.app.db import ...`、RateVersion 读取、duty_days/target/rate_rates 收集、`from backend.app.services.engine_bridge import days_in_month`），以及函数签名里的 `db=None`/`month` 参数里 db 相关逻辑。`total_days` 固定 30（CLI 无 DB）。`store_map`/`rate_rates`/`duty_days_map`/`target_map` 全置空 dict（CLI 无 DB，导出表对应列为空/默认）。

改后 `write_excel(result, out_path, month=None)` 签名；`if db:` 块整删；`else: total_days = 30` 保留为无条件；`build_rows_from_breakdown(result, {}, {}, {}, {}, total_days, tier_names)`。

- [ ] **Step 2: 跑全量确认绿**

Run: `uv run pytest -q`
Expected: 全绿（exporter 无单测，但 cli 集成测试 test_cli_integration 会跑 write_excel(db=None)，确认 CLI 仍可导出）

- [ ] **Step 3: Commit**

```bash
git add salary_engine/exporter.py
git commit -m "refactor(exporter): 删死代码 db 分支，CLI 纯净化（H2 + 修 H12 硬耦合）"
```

---

## Task 4: 删 ORM RateVersion 模型 + Month.rate_version_id 列定义 + schemas

**Files:** Modify `backend/app/db.py`、`backend/app/schemas.py`

> 物理表/列保留（不动 schema），只删 ORM 映射。生产 salary.db 的 rate_versions 表与 months.rate_version_id 列成为孤立（无害）。

- [ ] **Step 1: db.py 删 RateVersion 类**

删 `backend/app/db.py` 的整个 `class RateVersion(Base)` 块（约 line 49-56）。

- [ ] **Step 2: db.py 删 Month.rate_version_id 列**

删 `Month` 类里的 `rate_version_id = Column(Integer, nullable=True)` 行（约 line 104）。

- [ ] **Step 3: schemas.py 删 RateVersionOut / RateVersionCreate / MonthOut.rate_version_id**

删 `RateVersionOut`、`RateVersionCreate` 两个 class；删 `MonthOut` 里的 `rate_version_id` 字段。

- [ ] **Step 4: 跑全量确认绿（此时会有 import 错误，需先做 Task 5 的 conftest/test 清理）**

> 注意：此 task 删模型后，conftest/test_db/test_engine_bridge 仍 import RateVersion 会报错。**本 task 与 Task 5 一起跑测试**（先改完 Task 5 再跑全量）。或本 task 后立即做 Task 5。

- [ ] **Step 5: Commit（与 Task 5 合并提交，或本 task 先提交 import 错误已知）**

```bash
git add backend/app/db.py backend/app/schemas.py
git commit -m "refactor(db): 删 RateVersion ORM 模型与 Month.rate_version_id 列定义（H2，物理保留）"
```

---

## Task 5: conftest + test_db + test_engine_bridge 清理 RateVersion 引用

**Files:** Modify `backend/tests/conftest.py`、`backend/tests/test_db.py`、`backend/tests/test_engine_bridge.py`

- [ ] **Step 1: conftest.py seed 改 SalaryPolicyVersion**

把 `backend/tests/conftest.py` 的 `_seed` 改为种 SalaryPolicyVersion（与 main.seed_salary_policy 同逻辑），删 RateVersion 引用：

```python
def _seed(db):
    from salary_engine.rates import seed_rate_table as _seed_rates
    from backend.app.db import SalaryPolicyVersion
    if not db.query(SalaryPolicyVersion).first():
        rt = _seed_rates()
        cr = {}
        for (cls, bucket, tier), frac in rt.rates.items():
            cr.setdefault(cls, {}).setdefault(bucket, {})[tier] = str(int(frac * 100))
        db.add(SalaryPolicyVersion(
            version=1, effective_from=rt.effective_from, is_current=True,
            content={"margin_rules": {}, "commission_rates": cr}))
    db.commit()
```

import 行 `from backend.app.db import Base, get_db, User, RateVersion` 删掉 `RateVersion`。

- [ ] **Step 2: test_db.py 删 RateVersion import**

`backend/tests/test_db.py:3` 的 `from backend.app.db import Base, Product, Store, MonthlyTarget, RateVersion, User` 删 `RateVersion`。

- [ ] **Step 3: test_engine_bridge.py 改 test_rates_roundtrip 用 SalaryPolicyVersion**

`backend/tests/test_engine_bridge.py:4` 删 `RateVersion` import。`test_rates_roundtrip`（约 line 23-31）当前用 `RateVersion`，改为 `SalaryPolicyVersion`：

```python
def test_rates_roundtrip():
    """策略存百分数，rates_from_db 在边界 ÷100 转分数（ADR-009）。"""
    s = _db()
    cr = {"A": {"GE_100": {"低温高毛": "13"}}}
    s.add(SalaryPolicyVersion(version=1, effective_from=date(2026, 6, 1), is_current=True,
                              content={"margin_rules": {}, "commission_rates": cr}))
    s.commit()
    table = rates_from_db(s)
    assert table.rates[("A", "GE_100", "低温高毛")] == Decimal("0.13")
```

- [ ] **Step 4: 跑全量确认绿（Task 4 + 5 合并验证）**

Run: `uv run pytest -q`
Expected: 全绿（所有 RateVersion 引用已清）

- [ ] **Step 5: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_db.py backend/tests/test_engine_bridge.py
git commit -m "refactor(tests): conftest/bridge seed 改 SalaryPolicyVersion，清 RateVersion 引用（H2）"
```

---

## Task 6: frontend api.ts 删 rate_version_id

**Files:** Modify `frontend/src/api.ts:81`

- [ ] **Step 1: 删 MonthInfo.rate_version_id**

删 `frontend/src/api.ts` 的 `MonthInfo` interface 里 `rate_version_id?: number | null;` 行。

- [ ] **Step 2: tsc 验证**

Run: `(cd frontend && npx tsc --noEmit)`
Expected: 无错（前端没用 rate_version_id 字段）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts
git commit -m "refactor(frontend): 删 MonthInfo.rate_version_id（H2，后端字段已停用）"
```

---

## Task 7: 全量回归 + realdata

- [ ] **Step 1: 后端全量**

Run: `uv run pytest -q`
Expected: 全绿（比改前少 test_rates.py 的 2 个测试 + test_engine_bridge test_rates_roundtrip 改写）

- [ ] **Step 2: realdata 对账不变**

Run: `uv run pytest -s -m realdata -q 2>&1 | grep "total_commission"`
Expected: `86728.5441`（与 H2 前一致——realdata 用引擎 seed_rate_table，不碰 DB RateVersion）

- [ ] **Step 3: 前端 build**

Run: `(cd frontend && npm run build)`
Expected: 成功

- [ ] **Step 4: grep 确认无残留**

Run: `grep -rn "RateVersion\|rate_version_id\|rate-versions" --include="*.py" --include="*.ts" --include="*.tsx" backend/ salary_engine/ frontend/src/ tests/ | grep -v "seed_rate_table\|salary_engine/rates\|migrate_rates_to_policy\|alembic"`
Expected: 无输出（DB RateVersion 引用全清；引擎 seed_rate_table 保留）

- [ ] **Step 5: push**

```bash
git push
```

---

## Self-Review

**1. Spec/ADR 覆盖：** ADR-006"废弃 RateVersion，迁移后停用" → Task 1-6 全覆盖（router/seed/exporter/ORM/schemas/conftest/test/frontend）。✓
**2. Placeholder 扫描：** 无 TBD；Task 3 的 exporter 改动描述了删什么（db 分支 + 依赖），实现时按描述删（exporter 无单测，CLI 集成测试守护）。
**3. 类型一致：** seed_salary_policy 的 cr 构造（百分数 str）与 conftest _seed、ADR-009 一致；SalaryPolicyVersion.content 结构与 engine_bridge.rates_from_db 读取一致。
**4. 零迁移风险：** 物理表/列保留（无 Alembic drop），生产 salary.db 不动；ORM 不映射 RateVersion 即停用。

**遗留风险：** Task 3 删 exporter db 分支后，若未来 Web 又想用 exporter.write_excel(db=...) 会没这能力——但 Web 已用 ledger_export，且 ADR-002 物化模型下 exporter.write_excel 无用武之地。可接受。
