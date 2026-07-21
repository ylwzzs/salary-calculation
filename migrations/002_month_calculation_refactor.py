#!/usr/bin/env python3
"""月度计算页面重构数据库迁移

添加：
- anomalies 表
- months.current_step 列
- months.step_data 列

使用方式：
  /Users/Duo/Documents/MytechCode/salary_calculation/.venv/bin/python migrations/002_month_calculation_refactor.py
"""

import os
import sqlite3
import sys
from pathlib import Path

# 数据库路径：优先 SALARY_DB（容器/生产），否则项目根 salary.db（本地）
DB_PATH = Path(
    os.environ.get("SALARY_DB")
    or str(Path(__file__).resolve().parent.parent / "salary.db")
)


def main():
    if not DB_PATH.exists():
        print(f"❌ 数据库文件不存在: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # 1. 创建 anomalies 表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='anomalies'")
    if not cursor.fetchone():
        cursor.execute("""
            CREATE TABLE anomalies (
                id INTEGER PRIMARY KEY,
                month VARCHAR NOT NULL,
                anomaly_type VARCHAR(10) NOT NULL,
                entity_type VARCHAR(50),
                entity_id VARCHAR(100),
                description VARCHAR(500),
                status VARCHAR(20) DEFAULT 'pending',
                resolution VARCHAR(200),
                created_at DATETIME,
                resolved_at DATETIME
            )
        """)
        cursor.execute("CREATE INDEX idx_anomalies_month ON anomalies(month)")
        print("✅ 创建 anomalies 表")
    else:
        print("ℹ️ anomalies 表已存在")

    # 2. 添加 current_step 列
    cursor.execute("PRAGMA table_info(months)")
    cols = {c[1] for c in cursor.fetchall()}

    if "current_step" not in cols:
        cursor.execute("ALTER TABLE months ADD COLUMN current_step VARCHAR(20) DEFAULT 'import'")
        print("✅ 添加 months.current_step 列")
    else:
        print("ℹ️ months.current_step 已存在")

    if "step_data" not in cols:
        cursor.execute("ALTER TABLE months ADD COLUMN step_data TEXT DEFAULT '{}'")
        print("✅ 添加 months.step_data 列")
    else:
        print("ℹ️ months.step_data 已存在")

    # 3. 更新已有记录的 current_step
    cursor.execute("UPDATE months SET current_step = 'import' WHERE current_step IS NULL")
    cursor.execute("UPDATE months SET step_data = '{}' WHERE step_data IS NULL")

    conn.commit()
    conn.close()
    print("✅ 数据库迁移完成")


if __name__ == "__main__":
    main()
