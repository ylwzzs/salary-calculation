"""salesrecord add extra

Revision ID: 55a813f6009e
Revises: 5470c8774b8d
Create Date: 2026-07-19 21:49:39.586837

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55a813f6009e'
down_revision: Union[str, Sequence[str], None] = '5470c8774b8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.add_column(sa.Column('extra', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('sales_records', schema=None) as batch_op:
        batch_op.drop_column('extra')
