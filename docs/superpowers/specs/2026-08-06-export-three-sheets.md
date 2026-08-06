# Web 导出三 sheet：计算结果 + 台账 + 考勤排版（ADR-020）

> 2026-08-06。用户反馈"导出计算结果跟实际脱节"，根因：Web 导出只有逐笔台账，缺页面「计算结果」列表。

## 背景

`/months/{month}/export`（→ `backend/app/services/ledger_export.py`）当前只写**一张「提成台账」sheet**（DetailRow JOIN SalesRecord 逐笔流水，24 列）。

用户期望导出的是**页面「计算结果」列表**（`ResultTable`：按人×店的聚合——目标/考勤/销售额/达标率/提成 + 5 档明细）。所见 ≠ 所得 → "脱节"。

CLI `salary_engine/exporter.py` 反而有 Sheet1 计算结果；Web 缺，两边不一致。

## 决策（ADR-020）

`/export` 改为导出**三 sheet**，全部读物化表、零重算（守 ADR-002）：

| Sheet | 内容 | 数据源 |
|---|---|---|
| **Sheet1「计算结果」** | 按人×店的聚合汇总：员工/门店/门店类型/月目标/日目标/考勤天数/实际目标/销售额/达标率/达标档位/提成金额 + 5 档明细（销售/比例/提成） | `Result`（人×店，与页面同源）+ `Store` + `MonthlyTarget` + `Duty` 计数 + 从已查逐笔行聚合 5 档 |
| **Sheet2「提成台账-{month}」** | 现有 24 列逐笔流水（**保留不动**） | DetailRow JOIN SalesRecord |
| **Sheet3「考勤排版」** | 门店×日期当班矩阵（与前端 DutyGrid 一致） | `Duty` 表 |

## Sheet1 列（26 列，与 CLI exporter.py Sheet1 对齐）

```
员工姓名 | 门店 | 门店类型 | 月目标 | 日目标 | 考勤天数 | 实际目标 | 销售额 | 达标率 | 达标档位 | 提成金额
常温高毛_销售/比例/提成 | 常温低毛_销售/比例/提成 | 低温高毛_销售/比例/提成 | 低温低毛_销售/比例/提成 | 特价_销售/比例/提成
```

派生规则（与 CLI `build_rows_from_breakdown` 一致）：
- 门店类型：`Store.store_class`
- 月目标：`MonthlyTarget[store].target`
- 日目标 = 月目标 / `days_in_month`
- 考勤天数 = `Duty` 中 (person, store) 的当班日计数
- 实际目标 = 日目标 × 考勤天数
- 销售额 / 达标率 / 档位 / 提成 = `Result.sales / achievement / bucket / commission`
- 5 档明细：从已查逐笔行按 (person, store, tier) 聚合 amount/commission；比例取该 (store,bucket,tier) 的 `DetailRow.rate`（单一真值源），显示为百分数

## Sheet3 排版

```
门店   | 1号 | 2号 | ... | 30号
福景店 | 高睿 |      | ... | 张三
```
行 = `Duty` 中出现的店（排序）；列 = 1..当月天数；格 = 当班人（多人当天按 Duty.salesperson 原样）。

## 对账与边界

- Sheet1 Σ提成 == `Result` Σ == Sheet2 逐笔 Σ（compute 保证 breakdown.commission = ps_commission = 逐笔归集）。
- **边界**：无当班人的销售只进 DetailRow 不进 Result（既有语义，ADR-008）→ 此时 Sheet2 Σ 略大于 Sheet1 Σ。6 月实测无此类行，Σ 一致（85560.92）。
- Sheet2 名称保留 `提成台账-{month}`，不破坏现有导出测试（`test_export_ledger_has_tags_and_fields` 等按名取值）。

## 影响

- `backend/app/services/ledger_export.py`：
  - 新增 `build_summary_rows(results, tier_rows, store_map, target_map, duty_days_map, days)` → Sheet1 行列表
  - 新增 `build_duty_grid(duty_rows)` → {store: {day: 当班人}}
  - 新增 `write_salary_export(month, summary_rows, ledger_rows, duty_grid, days, path)` → 三 sheet writer
  - 抽 `_write_summary_sheet` / `_write_ledger_sheet` / `_write_duty_sheet`；**删除** `write_ledger_excel`（唯一调用方改调新函数）
- `backend/app/routers/workflow.py` `/months/{month}/export`：增查 Result/Store/MonthlyTarget/Duty；5 档从已查逐笔行聚合（不加查询）。
- 测试：`backend/tests/test_ledger_export.py`（纯函数单测）+ `test_workflow.py` 增对账集成测试。
