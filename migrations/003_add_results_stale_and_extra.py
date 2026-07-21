#!/usr/bin/env python3
"""补 months.results_stale + sales_records.extra（漏迁移修复）

背景（踩坑）：
  这两列在 ORM 已定义（db.py），但从未写进任何迁移脚本（001/002 都没覆盖）。
  create_all 只建不存在的表，不给已存在的表补列；部署流程也不跑迁移。
  → 生产库（历史遗留 schema）缺这两列，读 Month/SalesRecord 时报
    `no such column` → 目标创建、月份加载、销售流水导入全部 500。

  - months.results_stale: ADR-014（主数据变更标 stale）/ ADR-002（物化）
  - sales_records.extra:  导入留底（源 Excel 全字段）、台账导出"源字段"列

使用方式：
  python migrations/003_add_results_stale_and_extra.py [db_path]
  默认读环境变量 SALARY_DB，否则项目根 salary.db。幂等，可重复执行。
"""
import sqlite3
import sys
import os
from pathlib import Path


def main():
    db_path = (
        sys.argv[1] if len(sys.argv) > 1
        else os.environ.get("SALARY_DB")
        or str(Path(__file__).resolve().parent.parent / "salary.db")
    )
    if not Path(db_path).exists():
        print(f"❌ 数据库不存在: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)

    def cols(t):
        return {r[1] for r in conn.execute(f"PRAGMA table_info({t})").fetchall()}

    # 1. months.results_stale
    if "results_stale" not in cols("months"):
        conn.execute("ALTER TABLE months ADD COLUMN results_stale BOOLEAN DEFAULT 1")
        print("✅ 补 months.results_stale")
    else:
        print("ℹ️ months.results_stale 已存在，跳过")

    # 2. sales_records.extra
    if "extra" not in cols("sales_records"):
        conn.execute("ALTER TABLE sales_records ADD COLUMN extra TEXT")
        print("✅ 补 sales_records.extra")
    else:
        print("ℹ️ sales_records.extra 已存在，跳过")

    # 3. 历史 computed 月份本就有效，不该被标 stale（默认 1 会误标）
    n = conn.execute(
        "UPDATE months SET results_stale = 0 WHERE status = 'computed' AND results_stale = 1"
    ).rowcount
    if n:
        print(f"✅ {n} 个 computed 月份 results_stale 置 0")

    conn.commit()
    conn.close()
    print("✅ 迁移完成")


if __name__ == "__main__":
    main()
