"""add resume and jd history links

Revision ID: 20260516_0001
Revises:
Create Date: 2026-05-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260516_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.resumes') IS NOT NULL THEN
                ALTER TABLE resumes ADD COLUMN IF NOT EXISTS resume_url VARCHAR;
            END IF;

            IF to_regclass('public.job_descriptions') IS NOT NULL THEN
                ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS source_url VARCHAR;
            END IF;

            IF to_regclass('public.optimization_history') IS NOT NULL THEN
                ALTER TABLE optimization_history ADD COLUMN IF NOT EXISTS generated_pdf_url VARCHAR;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.optimization_history') IS NOT NULL THEN
                ALTER TABLE optimization_history DROP COLUMN IF EXISTS generated_pdf_url;
            END IF;

            IF to_regclass('public.job_descriptions') IS NOT NULL THEN
                ALTER TABLE job_descriptions DROP COLUMN IF EXISTS source_url;
            END IF;

            IF to_regclass('public.resumes') IS NOT NULL THEN
                ALTER TABLE resumes DROP COLUMN IF EXISTS resume_url;
            END IF;
        END $$;
        """
    )
