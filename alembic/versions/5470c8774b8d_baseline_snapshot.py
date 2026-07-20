"""baseline snapshot

Revision ID: 5470c8774b8d
Revises:
Create Date: 2026-07-19 21:29:04.323197

基线说明
========
- 现有 salary.db 已通过 Base.metadata.create_all() 创建全部表；本 baseline 仅占版本号，
  upgrade()/downgrade() 体保持 pass，不改动现有 schema。
- autogenerate 时检测到一处 ORM 与 DB 的差异（已在下方记录），但**不在 baseline 修复**，
  交由后续 P1 迁移按需处理（避免 baseline 改动既有库）：
    * months.step_data: ORM=JSON, DB=TEXT （SQLite JSON 实际以 TEXT 存储，语义等价）
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5470c8774b8d'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """基线只占版本号：表已存在，不做任何 DDL。"""
    pass


def downgrade() -> None:
    """基线不可降级（无前序版本）。"""
    pass
