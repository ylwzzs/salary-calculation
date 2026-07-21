#!/bin/sh
set -e

# backend 容器启动入口（ADR-016）
# 1. 建库：init_db() 用最新 ORM 建表；对已存在的老库，create_all 不改已存在表
python -c "from backend.app.db import init_db; init_db()"

# 2. 跑迁移脚本（幂等，补老库缺的列/表；新建库会跳过）
for f in /app/migrations/0*.py; do
    [ -e "$f" ] || continue
    echo "[entrypoint] 运行迁移: $(basename "$f")"
    python "$f"
done

echo "[entrypoint] 迁移完成，启动应用"
exec python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
