"""data migrate rates to policy

Revision ID: 189805f8dadd
Revises: bd1a32964df9
Create Date: 2026-07-19 22:14:18.309318

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '189805f8dadd'
down_revision: Union[str, Sequence[str], None] = 'bd1a32964df9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Data migration: seed SalaryPolicyVersion from current RateVersion (idempotent)."""
    from backend.scripts.migrate_rates_to_policy import run
    run()


def downgrade() -> None:
    """Data migration is not reversible — do not delete user-edited policy rows."""
    pass
