# 计算数据流重构 设计 spec

- 日期：2026-07-19
- 状态：已确认（2026-07-19，用户同意全部决策与待确认项）
- 作者：Claude（经与用户架构讨论）
- 关联：审计记忆 `audit-2026-07-19-findings`、`plan1-engine-validated`；前序 spec `2026-07-17-month-calculation-refactor-design.md`

---

## 1. 背景与问题

2026-07-19 全项目审计 + 性能根因核实，确认两类问题同源：

**性能/卡死（用户反馈"导入后计算慢、反复切节点卡死"）：**
- R1 `tier_summary`/`export` 每次调用都 `_run_compute()` 全量重算（`workflow.py:488,558`）。
- R2 `Result` 表只存 (人,店) 聚合，**逐笔提成明细不落库**，下钻只能重算或从 SalesRecord 重推导（`tier_detail` 又是另一套逻辑）。
- R3 无 single-flight：展开多行 = 多个全量 `compute()` 叠加，占满 FastAPI 线程池 → 卡死。
- R4 导入逐行 INSERT 9 万次（`sales_importer.py:34-73`）。
- R5 每次进 Results 触发全量异常扫描。

**正确性（审计 Critical）：**
- C1 工资策略页编辑对计算无效：UI 写 `SalaryPolicyVersion`，`compute` 只读 `RateVersion`（`engine_bridge.py:16-29`）。
- C2 拖拽调班/当班修正对计算不可见：`_run_compute` 从原始 Excel(`_sales_cache`)重读，无视 SalesRecord/TransferRecord（`workflow.py:290-309`）。
- C3 当班天数取自"有销售的天"而非当班表 → 达成虚高、多发钱（`calculator.py:90-111`，可复现反例）。

**根因总结**：系统把 `compute()` 当成"按需重算的瞬态函数"——既没物化结果、又没并发保护、还读着陈旧的 Excel 源。性能与 C2 是同一架构问题的两面。

## 2. 目标 / 非目标

**目标（用户硬需求）：精确、流畅、可对账。**
- 精确：单一真值源；工资总额与逐笔提成 Σ 数学相等；策略编辑生效；调班/当班修正可见；当班天数口径正确。
- 流畅：所有结果页/下钻/导出均为带索引的查询，毫秒级，不卡死。
- 可对账：导入全字段留底 + 逐笔去向标签台账，每笔可追原始字段。

**非目标：**
- 不换数据库引擎（留 SQLite）。
- 不修 C4/C5/C6 等引擎边缘 bug（赠送+退货、多人并列当班、breakdown 漏 fallback）——需先用真实数据验证影响面，单独 spec。本 spec 仅修 C1/C2/C3。
- 不做水平扩容/多租户/任务队列。

## 3. 决策与备选（记录决策过程，遵守 CLAUDE.md 铁律 4）

| 决策 | 备选 | 结论与理由 |
|---|---|---|
| 存储引擎 | 换 Postgres / 留 SQLite | **留 SQLite + 开 WAL**。场景为单用户、月度批量、零并发、9 万行/月、单 Docker。R1–R5 均为应用层问题，换库不解决反增运维。锁竞争由 WAL + single-flight 消除。 |
| 计算结果消费模型 | A 算一次+全量物化 / B 内存缓存 / C 最小止血 | **A**。唯一能同时保证"总额=逐笔Σ"（精确）与"所有点击毫秒级"（流畅）。B 重启即失、staleness 难控；C 不满足精确/流畅硬要求。 |
| 台账粒度 | 逐行 / 按(单号,条码)分组 | **逐行**。每条导入记录一行，commission=`行amount×组rate`，Σ=工资总额精确相等；最透明、最好对账。 |
| 逐行提成来源 | M1 引擎直出逐行 DetailRow / M2 桥接层展开 | **M1**。让引擎产出逐行明细，单一计算源；M2 在桥接层重走分组逻辑，有与引擎漂移的风险（正是要消灭的隐患）。 |
| C1–C3 是否并入 | 并入 / 拆分单独 spec | **C1/C2/C3 并入**（C1/C2 是"真值源"主线直接产物；C3 有明确反例且属规格违背）。C4/C5/C6 拆出，先数据验证。 |

## 4. 架构总览（4 条主线）

1. **真值源切换**：`compute()` 改从 `SalesRecord` 读入参（不再读 `_sales_cache` 的 Excel）。Excel 仅作原件存档于 `uploads/`。→ 治 C2。
2. **算一次 + 物化**：`POST /compute` 跑一次引擎，落库 `Result`（聚合）+ `DetailRow`（逐行台账）。所有读端点查物化表，零重算。→ 治 R1/R2。
3. **staleness**：任一输入变更置 `Month.results_stale=true`；结果页见 stale 提示"数据已变更，请重新计算"，不喂旧数据、不自动重算。
4. **single-flight**：compute 按月进程锁 + `Month.status=computing`；已在算则 409。→ 治 R3。

## 5. 数据模型变更

### 5.1 `SalesRecord` — 全字段留底
- 保留现有显式列（引擎/UI 用到的）。
- 新增 `extra: JSON`，导入时把源 Excel **其余所有列**原样存入。源表以后加列也不丢字段。
- 新增 `sales_record_id` 在 SalesLine 上的映射（见 5.2/7.2），用于 DetailRow 反查。

### 5.2 `DetailRow`（**新增表**）— 逐笔提成台账
```
DetailRow:
  id            PK
  month          (indexed)
  sales_record_id  → SalesRecord.id   (逐行 1:1，便于 join 全字段)
  person         归属人（当班解析后，非收银员）
  store          归属店
  sale_date      归属日
  barcode, product_name
  tier           商品档位（常温高毛/常温低毛/低温高毛/低温低毛/特价）
  bucket         达成档（GE_100/90_100/80_90/70_80/LT_70）
  rate           提成比例（Decimal）
  amount         该行金额（退货为负）
  commission     = amount × rate
  tag            去向标签（互斥，见 §12 / ADR-008）
  is_transferred 调班转移标记（正交）
  flag           引擎标记（""/"退货冲抵"/"退货未匹配"）
Index: (month), (month, person, store), (sales_record_id)
```
**台账逐行全覆盖**：被剔除的行（赠送/不计提成/非乳品）**也生成 DetailRow**（commission=0，tag 标原因），保证导出可穷举对账（ADR-008）。

### 5.3 费率表合一（治 C1）
- `compute` 改读 `SalaryPolicyVersion.content.commission_rates`（经 `engine_bridge` 转 `RateTable`）。
- 废弃 `RateVersion`（保留表与一次性迁移脚本，迁历史数据到 `SalaryPolicyVersion`，迁移后停用）。
- `Month.policy_version_id`：**首次 compute 时锁定**，重算不覆盖（修审计 H10）；`rate_version_id` 字段废弃。

### 5.4 `Month`
- 新增 `results_stale: Boolean`（默认 true）。
- `status` 枚举扩展：`draft | computing | computed`。

### 5.5 索引
- `Result(month)`、`DetailRow(month,person,store)`、`DetailRow(sales_record_id)`、`SalesRecord(month,store,sale_date,salesperson)` 复合索引。

### 5.6 迁移
- 引入 **Alembic**；现有 `salary.db` 平滑升级：建 `DetailRow`、补 `SalesRecord.extra`、补 `Month.results_stale`、迁 `RateVersion`→`SalaryPolicyVersion`、补索引。同时修审计 H19（历史缺迁移列）。

## 6. 数据流（改造后）
```
导入(批量 upsert + 存全字段含 extra + 打 tag) 
  → [改当班/目标/策略激活：置 results_stale=true]
  → POST /compute(single-flight, 从 SalesRecord 读真值, 跑引擎, 
                  物化 Result + DetailRow, 锁 policy_version_id, 置 stale=false)
  → 读端点(results/tier-summary/tier-detail/sales-detail/export)全查物化表(毫秒)
  → 导出 = SalesRecord LEFT JOIN DetailRow（逐行 + 全字段 + 标签）
```

## 7. 计算与物化

### 7.1 真值源（治 C2）
- `engine_bridge` 新增 `sales_lines_from_db(db, month)`：从 `SalesRecord` 构建 `SalesLine` 列表。**不过滤**——把该月全部销售/退货行原样交给引擎。
- **过滤是引擎的单一职责**：赠送剔除（gift_keys）、不计提成（exclude_commission）、非乳品（products 命中）一律由 `compute()` 内部决定。`SalesRecord.tag` 仅供展示/对账，**不参与计算过滤**，避免桥接层与引擎双重过滤导致不一致。
- 每个 SalesLine 携带其 `SalesRecord.id`（透传到 DetailRow，见 7.2）。
- `_run_compute` 用 `sales_lines_from_db` 替代 `_load_sales_lines(m.sales_file)`。`_sales_cache` 仅保留给 `infer-duty`/`check-anomalies`（或一并改读 SalesRecord，见 §11 取舍）。

### 7.2 引擎改逐行 DetailRow（M1）
- `compute()` 内：正常销售组改为**逐行**发 DetailRow——组内每条销售行与每条精确匹配的退货行各一行，`commission = 行amount × 组rate`，`flag` 分别为 `""` 与 `"退货冲抵"`。
- 不匹配退货保持逐行（`flag="退货未匹配"`）。
- 每个 DetailRow 透传对应 `SalesRecord.id`（SalesLine 携带）。
- **剔除行也发 DetailRow**（commission=0，tag=赠送剔除/不计提成/非乳品），保证台账逐行全覆盖（ADR-008）。
- 不变量：`Σ DetailRow.commission == 总额` 且 `|DetailRow| == |入参行数|`，新增单测断言。
- `breakdown`（人×店聚合）逻辑不变。

### 7.3 物化落库
`POST /compute` 成功后（事务内）：
1. 删旧 `delete from Result where month` + `delete from DetailRow where month`。
2. 写 `Result`（来自 `result.breakdown`）+ `DetailRow`（来自 `result.details`，逐行）。
3. 锁 `Month.policy_version_id`（仅首次）、置 `status=computed`、`results_stale=false`。
4. 单次 commit；失败 rollback。

## 8. C1 修复（费率合一）
- `engine_bridge.rates_from_db(db, policy_version_id)`：读 `SalaryPolicyVersion.content.commission_rates`，按 `(cls,bucket,tier)` 重建 `RateTable`。锁定优先：`Month.policy_version_id` → 否则 `is_current=True`。
- 缺失/已删 → 显式 `HTTPException(404)`（修审计中 `rv.rates` 解引用 500）。
- `SalaryPolicyContent` 加严格 pydantic 校验（修 JSON 无结构校验）。

## 9. C3 修复（当班天数）
- 现状（`calculator.py:102-111`）：`ps_target` 在遍历 `daily_sales`（仅有销售的天）时累加 `tgt/days`，零销售当班日不计入 → 目标偏低、达成虚高。
- 修复：`ps_target` 改为**遍历当班表 `duty`**累加——
  ```
  for (s, d), _ in duty.items():
      p = _resolve_duty(duty, s, d, None)
      if p is None: continue
      tgt = targets.get(s)
      if not tgt: missing_target_stores.add(s)
      else: ps_target[(p, s)] += tgt / days
  ```
  `ps_sales` 仍在 `daily_sales` 循环累加（业绩只发生在有销售的天）。达成率 = ps_sales / ps_target，分母现在正确含全部当班天。
- 注：`duty_override=None`（CLI 自动推断）时，`infer_duty` 仅对有销售的天产出，行为不变；修复主要影响 Web 人工确认当班路径（正是反例场景）。
- 单测：复刻审计反例（高睿 6/1+6/2 当班、仅 6/1 有销售），断言 target=2 天份额、bucket=LT_70。

## 10. staleness 与 single-flight
- **置 stale**：`import-sales/import-gifts/set-duty/transfer-duty/targets.set/salary-policies.activate` 成功后置 `Month.results_stale=true`。
- **读端点**：若 `results_stale=true` 或 `status!=computed`，`/results` 等返回 `{stale: true}` 标志（不 500），前端据此提示重算；`/compute` 仍可调用。
- **single-flight**：进程内 `dict[month] → threading.Lock` + 进入即置 `status=computing`；并发 compute 对同月返回 409「正在计算」。compute 结束（成功/失败）置回 `computed`/原状。

## 11. 性能措施
- SQLite：`PRAGMA journal_mode=WAL`、`PRAGMA busy_timeout=10000`（事件监听器）。
- 导入批量化：`session.bulk_insert_mappings` 或 `insert().values([...])`，9 万行分钟→秒（治 R4）。
- 索引：见 5.5。
- `compute()` 本身 CPU-bound（Decimal×9万行），单次可接受；实测若仍慢，作为后续优化（float/向量化），非本 spec 必须。
- `tier_summary/tier_detail/sales-detail/export` 全部改为查物化表，删除 `_run_compute` 调用。

## 12. 台账与导出（用户需求落点）
- 导出表 = `DetailRow JOIN SalesRecord`（DetailRow 已逐行全覆盖，见 ADR-008），每条导入记录一行：
  - 全部原始字段（含 extra）+ 收银员(SalesRecord) + 归属人(DetailRow，当班解析)。
  - 去向标签 `tag`（互斥）：`有效计提 / 退货冲抵 / 退货未匹配 / 赠送剔除 / 不计提成 / 非乳品`。
  - 正交标记 `is_transferred`（调班转移），附 `original_store/original_date/transfer_reason`。
  - 提成：tier/rate/commission（剔除行 commission=0）。
- 对账闭环：`Σ(有效计提+退货冲抵+退货未匹配).commission = 工资总额`；`赠送/不计提成/非乳品`=0；`调班`可追溯原门店/原日期。
- 导出不再调引擎，直接查表写 xlsx（顺带修审计 H12 exporter 对 backend.db 的硬耦合）。

## 13. 测试策略
- 引擎：逐行 DetailRow 不变量（Σ=总额 且 |DetailRow|==入参行数）、剔除行 0 提成标签正确、C3 当班天数反例单测、C1 费率合一后引擎读 SalaryPolicyVersion。
- 后端：物化后 `/results`、`/tier-summary`、`/tier-detail` 数值一致（同源）；staleness 触发；single-flight 409；导入批量正确性。
- 迁移：老 `salary.db` 升级后 schema 完整、历史 RateVersion 正确迁入。

## 14. 风险与边界
- **C3 改动会改变部分人提成数字**（修 bug 使其更准）——需用户接受"修后数字会动"，并在真实 6 月数据上做前后对比核验。
- 逐行 DetailRow 写入量 ≈ 导入行数（9 万级/月），SQLite 批量写入 + 索引可承受。
- single-flight 为进程内锁；多副本部署需换 DB 级锁（当前非目标）。
- `infer-duty`/`check-anomalies` 是否一并改读 SalesRecord：建议改（统一真值源），但属增量，可在 plan 中作为可选项。

## 15. 不在本 spec（后续）
- C4 赠送剔除致匹配退货变未匹配；C5 多人并列当班静默归一人；C6 breakdown 漏 fallback；以及 H1/H13/H14 等引擎边缘鲁棒性。**先用真实 6 月数据验证影响面，再单独 spec。**

## 16. 参考引用
- 审计记忆：`audit-2026-07-19-findings.md`、`plan1-engine-validated.md`
- 关键文件：`salary_engine/calculator.py`、`backend/app/routers/workflow.py`、`backend/app/services/{engine_bridge,sales_importer}.py`、`backend/app/db.py`
- 前序：`docs/superpowers/specs/2026-07-17-month-calculation-refactor-design.md`
