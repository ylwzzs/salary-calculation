# 退货匹配修复（C4）+ 未匹配 DetailRow 补 sales_record_id

> 2026-07-22。审查「退货一正一负」逻辑发现的两个漏洞。

## 背景（审查发现）

退货按 `src_order+条码` 匹配原销售组：
- 命中 → 精确匹配，台账「退货冲抵」，commission 负，算给**原销售当天**当班人+档。
- 不命中 → 未匹配，台账「退货未匹配」，commission 负，算给**退货当天**当班人+档。

**漏洞1（代码 bug）**：退货未匹配的 DetailRow（`calculator.py:193`）**漏传 `sales_record_id`**（精确匹配 `:175` 传了）。→ 台账 `DetailRow JOIN SalesRecord` 连不上 → 这些退货行的小票号/收银员等字段空。生产 24 行 `sales_record_id` 全 None。

**漏洞2（C4，ADR-007 后续）**：赠送/非乳品/不计提成/不计考核的原销售被剔除（没进 groups），其退货 `src_order` 命不中 groups → 归「退货未匹配」→ 负 commission。但原销售 commission=0（剔除），退货却负 → **净负，多扣提成**。

## 修复

**漏洞1**：`:193` 退货未匹配 DetailRow 补 `sales_record_id=getattr(r,"sales_record_id",None)`。

**漏洞2（C4）**：退货匹配加一档——原销售被剔除的退货，归对应剔除标签（commission=0），同原销售命运；只有真·无原销售才走未匹配（负）。

calculator 步骤 1 后建 `excluded_index = {(receipt,barcode): tag}`；步骤 2 退货匹配：
1. 命中 groups（未剔除原销售）→ 精确匹配（退货冲抵）
2. `(src_order,barcode)` 在 excluded_index → 归剔除标签（0 提成，C4）
3. 否则 → 未匹配（负）

## 不修（设计口径，ADR-007 后续，需业务确认）

- 未匹配退货算「退货当天」当班人（精确匹配算原销售当天）
- 精确匹配退货 tier 按退货单价（C2「按每笔实际成交判定」）

## 影响

- 赠送等退货不再多扣（归剔除 0 提成）
- 退货未匹配台账字段完整（sales_record_id）
- 对账闭环不变：有效计提+退货冲抵+退货未匹配 Σ = 工资总额

## 测试

- 赠送销售 + 其退货 → 退货归「赠送剔除」（0），不进未匹配负
- 退货未匹配 DetailRow 有 sales_record_id（JOIN SalesRecord 不空）
