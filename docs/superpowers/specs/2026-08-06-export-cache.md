# 导出预生成缓存 + xlsxwriter（ADR-021）

> 2026-08-06。用户反馈导出慢（26s），实测瓶颈是 openpyxl 写 2.28M 单元格（~24s）。

## 背景

`/months/{month}/export` 三 sheet 导出（ADR-020）端到端 **26s**：

| 环节 | 耗时 |
|---|---|
| SQL 查询 95k 行（DetailRow JOIN SalesRecord） | 0.8s |
| dict 转换 | 0.4s |
| **openpyxl 写 95k 行台账（2.28M 单元格）** | **~24s** |
| xlsxwriter（实测，C 写器） | **9.5s** |

导出内容完全由计算产物决定（Result / DetailRow / SalesRecord / MonthlyTarget / Duty / Store），结果算完即可预生成文件。

## 决策

1. **写器换 xlsxwriter**：`write_salary_export` 用 xlsxwriter 重写（3 sheet 结构/列序不变，对账不变）。
2. **compute 后后台预生成缓存**：`/compute` 成功后 spawn `threading.Thread(daemon=True)`，用**独立 `SessionLocal()`** 会话调用 `_build_export_file(db, month, path)` 生成导出文件，原子写（tmp + `os.replace`）到 `/data/export_cache/salary_{month}.xlsx`。
3. **/export 缓存优先**：
   - 缓存文件存在 且 `not (results_stale or status != "computed")` → `FileResponse` 直接返回（秒开）。
   - 否则兜底同步生成（现算），非 stale 时写入缓存。
4. **失效**：沿用 `results_stale`（ADR-014 全覆盖）；重算自动重新生成。

## 关键实现点

- **后台线程独立会话**：请求的 `db` 在响应后即被 `get_db` 关闭，后台线程必须 `SessionLocal()` 自建会话；用完后 `db.close()`。
- **原子写**：先生成临时文件再 `os.replace`，避免读到半截文件（后台预生成与用户同步兜底可能并发）。
- **缓存目录**：`/data/export_cache/`（从 `SALARY_DB` 同目录派生），`os.makedirs(exist_ok=True)`。
- **后台生成守卫**：线程内再查一次 month，若已 stale / 非 computed / 月份不存在则放弃写（防止把过期数据缓存进去）。

## 测试

- 单测：xlsxwriter 写出的文件 openpyxl 可读、3 sheet 名/列正确。
- 集成：`_build_export_file` 产出 3 sheet 且 Sheet1 Σ==Sheet2 Σ；export 缓存命中不重算；stale 时绕过缓存重新生成；compute 后缓存文件出现。
