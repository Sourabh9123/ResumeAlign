"""store resume s3 object key

Revision ID: 20260516_0002
Revises: 20260516_0001
Create Date: 2026-05-16 00:00:01.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260516_0002"
down_revision: Union[str, None] = "20260516_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a durable S3 object-key column for generated resume PDFs."""
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.optimization_history') IS NOT NULL THEN
                ALTER TABLE optimization_history
                ADD COLUMN IF NOT EXISTS generated_pdf_s3_key VARCHAR;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Remove the generated resume S3 object-key column."""
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.optimization_history') IS NOT NULL THEN
                ALTER TABLE optimization_history
                DROP COLUMN IF EXISTS generated_pdf_s3_key;
            END IF;
        END $$;
        """
    )
