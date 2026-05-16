"""add short resume download tokens

Revision ID: 20260516_0003
Revises: 20260516_0002
Create Date: 2026-05-16 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260516_0003"
down_revision: Union[str, None] = "20260516_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add and backfill compact download tokens for generated resume PDFs."""
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.optimization_history') IS NOT NULL THEN
                ALTER TABLE optimization_history
                ADD COLUMN IF NOT EXISTS download_token VARCHAR;

                UPDATE optimization_history
                SET download_token = substr(replace(id::text, '-', ''), 1, 12)
                WHERE download_token IS NULL;

                CREATE UNIQUE INDEX IF NOT EXISTS ix_optimization_history_download_token
                ON optimization_history (download_token);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Remove compact download tokens from optimization history."""
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.optimization_history') IS NOT NULL THEN
                DROP INDEX IF EXISTS ix_optimization_history_download_token;
                ALTER TABLE optimization_history DROP COLUMN IF EXISTS download_token;
            END IF;
        END $$;
        """
    )
