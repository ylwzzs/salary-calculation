# 主数据 staleness 扩展 设计 spec（H1）

- 日期：2026-07-21
- 状态：✅ 已确认（2026-07-21）
- 关联：ADR-014、ADR-002（物化前提）、维度1架构审查 H1、ADR-008（台账）

## 1. 背景

维度1架构审查发现：`stores/products/import_master` 的增删改端点**全部不置** `Month.results_stale`。这些主数据进入引擎入参：
- `Store.store_class` → 决定费率档（A/B/C/D）
- `Store.exclude_assessment` → 决定门店是否参与考核
- `Product.category` → 决定非乳品过滤（ADR-010）
- `Product.cost` → 决定毛利率档（classify_tier）
- `Product.exclude_commission` → 决定剔除

变更后，已计算月份的物化 `Result`/`DetailRow` 与输入不一致，但 `/results` 返回 `stale=False`，前端不提示重算（H9 接入的提示永不触发）。违背 ADR-002"读端点查物化表"的设计前提（物化表必须与输入同步）。

## 2. 决策（ADR-014）

主数据端点变更成功后，**对所有 Month 置 `results_stale=true`**。

- **标所有月份**（不只当月）：主数据跨月共用。
- **仅提示不强制**：staleness 只让前端提示"建议重算"（H9），用户决定是否重算历史月份。
- draft 月份本就 stale（`status!='computed'`），标 `results_stale` 无副作用。

## 3. 范围（9 端点）

| router | 端点 | 改的主数据 |
|---|---|---|
| stores | `PUT /stores/{name}`（upsert）、`PATCH /stores/{name}`、`DELETE /stores/{name}`、`POST /stores/batch-class` | group/store_class/supervisor/exclude_assessment |
| products | `PUT /products/{barcode}`（upsert）、`PATCH /products/{barcode}`、`DELETE /products/{barcode}` | name/spec/category/cost/exclude_commission |
| import_master | `POST /import/products`、`POST /import/stores` | 批量 upsert 主数据 |

## 4. 实现

### 4.1 helper（`backend/app/db.py` 或 services）

```python
def mark_all_months_stale(db):
    """主数据变更：所有月份置 results_stale=True（ADR-014）。
    单 SQL 批量 update，不逐月。draft 月份本就 stale，无副作用。"""
    db.query(Month).update({Month.results_stale: True})
```

### 4.2 端点改造

9 个端点在 `db.commit()` 前（成功路径）调 `mark_all_months_stale(db)`。

### 4.3 不变量

- 改主数据后，任何 `status='computed'` 的 Month → `results_stale=True`。
- `/results` 的 `stale` 标志（`workflow.py:421`）自动反映（`results_stale or status!=computed`）。

## 5. 测试（TDD）

- **RED**：新增 `test_master_data_change_marks_months_stale`——建 computed 月份（stale=False）→ 改一商品（PATCH cost）→ 断言该月份 `results_stale=True`。
- 覆盖 stores（至少 upsert 或 batch-class）、products（PATCH）、import_master（至少 /import/products）各一端点。

## 6. 非目标

- 不自动重算（仅标 stale；重算由用户点"重新计算"）。
- 不区分"影响哪些月份"（主数据跨月，统一标所有）。
- 不改 SalaryPolicyVersion（费率版本变更的 stale 已在维度1 Medium 提及，另案；本 spec 只主数据）。

## 7. 风险

- 主数据频繁变更时所有月份反复 stale（提示频繁）——可接受，主数据变更本就低频。
- `mark_all_months_stale` 批量 update 所有 Month（~12-24 个月份），单 SQL，开销可忽略。
