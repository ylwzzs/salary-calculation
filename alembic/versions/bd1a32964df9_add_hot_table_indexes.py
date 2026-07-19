"""add hot table indexes

Revision ID: bd1a32964df9
Revises: 42d8290d722d
Create Date: 2026-07-19 22:09:34.492789

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bd1a32964df9'
down_revision: Union[str, Sequence[str], None] = '42d8290d722d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 仅补热查询索引；months.step_data / months.results_stale 的漂移忽略，不在本次迁移内处理。
    with op.batch_alter_table('detail_rows', schema=None) as batch_op:
        batch_op.create_index('idx_detail_month_person_store', ['month', 'person', 'store'], unique=False)

    with op.batch_alter_table('results', schema=None) as batch_op:
        batch_op.create_index('idx_results_month', ['month'], unique=False)

    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.create_index('idx_sales_month_store_date_person', ['month', 'store', 'sale_date', 'salesperson'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.drop_index('idx_sales_month_store_date_person')

    with op.batch_alter_table('results', schema=None) as batch_op:
        batch_op.drop_index('idx_results_month')

    with op.batch_alter_table('detail_rows', schema=None) as batch_op:
        batch_op.drop_index('idx_detail_month_person_store')
