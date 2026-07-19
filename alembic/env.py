"""Alembic 迁移环境。

- target_metadata = Base.metadata（来自 backend.app.db），作为 autogenerate 的真值源。
- 连接 URL 运行时从 backend.app.config.DB_URL 注入（alembic.ini 的 sqlalchemy.url 仅占位）。
- 开启 render_as_batch=True 以兼容 SQLite 的 ALTER 限制（后续加列/改约束需要）。
- 关键运行手册：
  * 基线迁移为 pass-through（upgrade/downgrade 都是 pass），因为基表已存在。
  * 全新库仍由 backend.app.main.init_db() 的 Base.metadata.create_all 建表。
  * 不要在全新空库上只跑 `alembic upgrade head`：基表不存在会让后续 add_column 迁移失败。
  * 正确顺序：先启动应用（create_all 建表），再 `alembic stamp head` 或 `alembic upgrade head`。
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
