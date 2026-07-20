# 架构文件（Architecture Decisions Record）

> 本文件是项目架构决策的**权威记录**，记录每个已确认架构决策的**决策过程**（背景 / 备选 / 理由 / 影响），遵守 `CLAUDE.md` 铁律 3、4。详细设计见 `docs/superpowers/specs/`；本文只锁"是什么 + 为什么"。

- 最近更新：2026-07-19
- 状态图例：✅ 已确认（锁定） · 📋 已规划后续
- **本轮（计算数据流重构）架构已全部确认**（2026-07-19），可进入 writing-plans。

---

## ADR-001 存储引擎：保留 SQLite + 开启 WAL ✅

- **决策**：不迁移 PostgreSQL；SQLite 留用，开启 `journal_mode=WAL` + `busy_timeout`。
- **背景**：用户反馈"导入后计算慢、反复切节点卡死"，担心是 SQLite 性能瓶颈。
- **核实**：经代码核实，慢/卡死的根因（R1 重算、R2 无物化、R3 无并发锁、R4 逐行 INSERT、R5 进面板全扫）**均为应用层问题，无一是 SQLite 天花板**；`compute()` 是纯 Python+Decimal、根本不碰数据库。
- **备选**：迁 Postgres。
- **理由（弃 Postgres）**：场景为单用户、月度批量、零并发、9 万行/月、单 Docker 实例。迁库会把同一套 bug 带过去且新增运维（独立进程/连接池/备份），而 SQLite 的唯一痛点（锁竞争）由 WAL + single-flight 即可消除。
- **影响**：部署仍单文件 `salary.db`；引入 Alembic 做迁移（顺带修 H19 历史缺列）。
- **复评触发条件**：出现水平扩容 / 多租户 / 多副本 / 真高并发 任一需求时，重评是否迁 Postgres。

## ADR-002 计算结果消费模型：算一次 + 全量物化（方案 A）✅

- **决策**：`POST /compute` 跑一次引擎，落库 `Result`（聚合）+ `DetailRow`（逐笔）；所有读端点查物化表，零重算。
- **背景**：现实现把 `compute()` 当"按需重算的瞬态函数"，每次下钻/导出全量重算 → 卡顿；且无 single-flight → 并发叠加卡死。
- **备选**：B 进程内存缓存 ComputeResult（重启即失、staleness 难控）；C 最小止血（只 WAL+single-flight+批量，不物化，下钻仍重算）。
- **理由（选 A）**：唯一能同时满足用户硬需求"精确"（单一真值源，总额=逐笔Σ）与"流畅"（所有点击毫秒级）。B 脆弱、C 不达标。
- **影响**：新增 `DetailRow` 表；compute 写入量 ≈ 导入行数（9 万级/月），SQLite 批量+索引可承受。

## ADR-003 台账与导出粒度：逐行 ✅

- **决策**：台账/导出表按**逐行**——每条导入销售/退货行 = 一行，`commission = 行amount × 组rate`，Σ逐行 = 工资总额（数学精确相等）。
- **备选**：按 (单号,条码) 分组（一组一行）。
- **理由（选逐行）**：最透明、最好对账；行数虽多（9 万级）但带索引毫秒可查。对账闭环：`有效计提`Σ=总额、`赠送`Σ=0、`退货`正负相抵、`调班`可追溯。
- **影响**：导出表 = `DetailRow JOIN SalesRecord`（逐行+全字段）。

## ADR-004 逐行提成的计算来源：引擎直出 DetailRow（M1）✅

- **决策**：改 `compute()` 使其**逐行**产出 DetailRow（组内每条销售/退货行各一行），单一计算源；物化层 1:1 落库，不再推导。
- **备选**：M2 引擎出按组、桥接层展开为逐行。
- **理由（选 M1）**：M2 在桥接层重走分组逻辑，有与引擎漂移的风险——正是本轮要消灭的隐患。M1 保证"计算只有一处"。
- **影响**：`salary_engine/calculator.py` 改逐行发 DetailRow；新增不变量单测 `Σ DetailRow.commission == 总额`。

## ADR-005 计算真值源：SalesRecord（治 C2）✅

- **决策**：`compute()` 改从 `SalesRecord` 读入参（不再读 `_sales_cache` 的 Excel）；Excel 仅作原件存档。
- **背景**：现 `_run_compute` 重读原始 Excel，无视 `SalesRecord`/`TransferRecord` → 拖拽调班、当班修正对计算不可见（C2）。
- **理由**：SalesRecord 是已解析、已打标签、已应用调班转移的真值；以它为源，C2 自然解决。
- **约束**：过滤（赠送/不计提成/非乳品）是**引擎单一职责**；`SalesRecord.tag` 仅供展示，不参与计算过滤，避免双重过滤不一致。

## ADR-006 费率表：合一为 SalaryPolicyVersion（治 C1）✅

- **决策**：`compute` 读 `SalaryPolicyVersion.content`，废弃 `RateVersion`；`Month.policy_version_id` 首次 compute 锁定、重算不覆盖。
- **背景**：UI 写 `SalaryPolicyVersion`、引擎读 `RateVersion`，两套并存 → 策略编辑对计算无效（C1）。
- **理由**：单一真值源；同时修审计 H10（版本锁被覆盖）、rate_version_id 解引用 500、JSON 无结构校验。
- **影响**：一次性迁移脚本 `RateVersion → SalaryPolicyVersion`，迁移后停用旧表。

## ADR-007 修复范围：C1/C2/C3 并入本轮，C4–C6 后续 ✅

- **决策**：C1（费率合一）、C2（真值源）、C3（当班天数）并入本轮重构。
- **理由**：C1/C2 是"真值源"主线直接产物；C3 有明确反例、属规格违背（非引擎口径争议）。
- **C3 风险（用户已确认接受）**：修 bug 后部分人提成数字会变（更准）；交付前在真实 6 月数据做前后对比核验，确认影响面。
- **后续（📋 已规划，不在本轮）**：C4 赠送剔除致匹配退货变未匹配、C5 多人并列当班静默归一人、C6 breakdown 漏 fallback、及 H1/H13/H14 引擎边缘鲁棒性。先用真实 6 月数据验证影响面，再单独 spec。

## ADR-008 台账标签 taxonomy（Claude 定）✅

- **决策**：6 个**互斥**去向标签（按提成命运）+ 1 个**正交**转移标记：
  - 互斥标签：`有效计提 / 退货冲抵 / 退货未匹配 / 赠送剔除 / 不计提成 / 非乳品`
  - 正交标记：`is_transferred`（调班转移），附 `original_store / original_date / transfer_reason`
- **台账逐行全覆盖**：引擎对**每条**导入行产出一条 DetailRow——计提的 `commission = 行amount × 组rate`；剔除的 `commission = 0` 且标签标明原因。单一源、可穷举对账。
- **理由**：
  - 互斥标签覆盖每条导入行的全部命运；对账闭环严格：`Σ(有效计提+退货冲抵+退货未匹配).commission = 工资总额`，其余标签 = 0。
  - **新增"非乳品"**：importer 现把非乳品行误标"有效"但引擎丢弃，台账会显示"有效却 0 提成"的矛盾；显式标"非乳品"消除歧义。
  - **调班转移做正交标记而非标签**：转移行同时也是"有效计提"等，做成标签会丢失提成命运信息；正交标记两者都保留。
- **影响**：引擎需对剔除行也产出 0 提成 DetailRow（commission=0 + 原因标签）；SalesRecord.tag 与引擎命运对齐（补"非乳品"）；导出多一列 `is_transferred`。

## ADR-009 费率存储约定：SalaryPolicyVersion 存百分数，边界 /100 ✅

- **决策**：`SalaryPolicyVersion.content.commission_rates` 存**百分数**（如 `12` = 12%，与 UI 工资策略编辑器一致、人类友好）；`engine_bridge.rates_from_db` 在 DB→引擎边界 **÷100** 转分数（`0.12`）喂引擎。引擎内部仍用分数乘数，不动。
- **背景**：旧 `RateVersion` 存分数（`seed_rate_table` 做 /100）；UI 策略编辑器存百分数。两表约定不同。C1 切换引擎读 `SalaryPolicyVersion` 时，若不做 /100 会产生 **100× 提成误差**（12 当乘数而非 0.12）。
- **备选**：(B) 把策略改存分数与 RateVersion 一致——需动 UI 编辑器+前端+现有数据迁移，范围大，弃。
- **理由（选 A）**：单一转换点（`rates_from_db`），UI 保持人类友好的百分数，引擎口径不变；改动最小、风险最低。
- **影响**：conftest 种子按百分数存；`migrate_rates_to_policy` 脚本对 RateVersion 分数 ×100 后存入；相关测试喂 `"15"` 期望 `Decimal("0.15")`。
- **决策过程**：T3.2 实现中发现（spec 原假设 `Decimal(str(pct))` 直接用是错的，会 100× 误差），按铁律 2 停下报用户；用户选 A（2026-07-19）。

## ADR-010 category=None（成本表有、信息表无）按非乳品排除 + 警告 ✅

- **决策**：条码在销售成本表但不在商品信息表（奶品白名单）→ `category=None` → 引擎按「非乳品」处理（不计提、进台账标"非乳品"）并 emit warning「缺分类：<条码>」，**不崩溃**。
- **背景**：T8.1 真实 6 月数据触发审计 H1——145 个成本表独有条码 `category=None`，3717 行（4.5%）在 `classify_tier(None)` 抛 `ValueError` 中断整次计算。样本混有真奶（信息表漏，如"低温酸奶"）与非奶（烟/水/茶）。
- **备选**：(B) 兜底当特价档计提——会误把非奶计提、多付钱，弃。(C) 先由数据负责人补全信息表——需数据修复，且引擎仍需不崩溃修复。
- **理由（选 A）**：商品信息表是奶品白名单（单一真值源）；不在白名单的不计提，避免多付非奶（更严重的错误）；真奶被排除由 warning 暴露，数据负责人补信息表后重导即正确。引擎健壮性优先（绝不因脏数据崩溃）。
- **影响**：`calculator` 过滤增加 `product.category is None → 非乳品 + 缺分类 warning`；真奶（如低温酸奶）在信息表补全前被排除（少付），靠 warning 提示。
- **决策过程**：T8.1 真实数据验证中发现（审计 H1 在真实数据触发），按铁律 2 停下报用户；用户选 A（2026-07-20）。

---

## ✅ 本轮确认项（2026-07-19，用户已全部同意）

1. C3 修复后部分人提成数字会变（更准）——**接受**，交付前真实 6 月数据前后对比核验。
2. 现有 `salary.db`（38MB）上 Alembic 平滑升级——**同意**。
3. 标签 taxonomy——**由 Claude 定**（见 ADR-008）。
4. 整体设计——**无遗漏**。

---

## 相关文件
- 详细设计 spec：`docs/superpowers/specs/2026-07-19-compute-dataflow-redesign-design.md`
- 审计依据：记忆 `audit-2026-07-19-findings`、`plan1-engine-validated`
- 协作规则：`CLAUDE.md`（铁律）
- 关键代码：`salary_engine/calculator.py`、`backend/app/routers/workflow.py`、`backend/app/services/{engine_bridge,sales_importer}.py`、`backend/app/db.py`
