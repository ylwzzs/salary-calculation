"""Alembic 运行环境。

设计要点（与 docs/ARCHITECTURE.md 对齐）：
- DB 连接始终复用应用配置 `backend.app.config.DB_URL`，避免在 alembic.ini 里硬编码路径导致漂移。
- `target_metadata = Base.metadata`：autogenerate 以应用 ORM 模型为真值源。
- 开启 `render_as_batch=True`：SQLite 对 ALTER 的支持有限，批量模式把单次 ALTER 包装成"重建表"，方便后续 P1 任务加列/改约束。
- 仓库根通过 alembic.ini 的 `prepend_sys_path = .` 加入 sys.path，因此 `backend.*` 可直接 import。
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# 引入应用 ORM：设置 target_metadata，并触发模型定义以便 autogenerate 感知。
from backend.app.config import DB_URL
from backend.app.db import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# 始终覆盖 alembic.ini 里的 sqlalchemy.url，确保 Alembic 与应用使用同一个 DB。
config.set_main_option("sqlalchemy.url", DB_URL)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 应用 ORM 的元数据，用于 autogenerate 比较。
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Offline 模式：仅用 URL 生成 SQL 脚本，不真正连库。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite 友好
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Online 模式：建 Engine 并在真实连接上跑迁移。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite 友好
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
