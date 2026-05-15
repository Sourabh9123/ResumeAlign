import asyncio
import os
import tempfile

from app.core.config import settings
from app.core.logging import logger


class PDFTextExtractionError(Exception):
    """Raised when text cannot be extracted from a PDF."""


class XPDFParser:
    """Extract text from PDF bytes using the XPDF `pdftotext` binary."""

    @staticmethod
    async def extract_text(pdf_bytes: bytes) -> str:
        """Return UTF-8 text extracted from a PDF document.

        XPDF's `pdftotext` works with file paths, so the input bytes are written
        to a short-lived temporary PDF and the extracted text is read from
        stdout. The temporary file is always removed before returning.
        """
        if not pdf_bytes:
            raise PDFTextExtractionError("PDF content is empty")

        temp_pdf_path = XPDFParser._write_temp_pdf(pdf_bytes)
        try:
            return await XPDFParser._run_pdftotext(temp_pdf_path)
        finally:
            XPDFParser._remove_temp_file(temp_pdf_path)

    @staticmethod
    def _write_temp_pdf(pdf_bytes: bytes) -> str:
        """Persist PDF bytes to a temporary file and return its path."""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                temp_pdf.write(pdf_bytes)
                return temp_pdf.name
        except OSError as exc:
            logger.error(f"Failed to write temporary PDF file: {str(exc)}", exc_info=True)
            raise PDFTextExtractionError("Failed to prepare PDF for extraction") from exc

    @staticmethod
    async def _run_pdftotext(pdf_path: str) -> str:
        """Run XPDF `pdftotext` and return stdout as text."""
        try:
            process = await asyncio.create_subprocess_exec(
                settings.XPDF_PDFTOTEXT_BINARY,
                "-enc",
                "UTF-8",
                "-q",
                pdf_path,
                "-",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            logger.error(
                f"XPDF binary not found: {settings.XPDF_PDFTOTEXT_BINARY}",
                exc_info=True,
            )
            raise PDFTextExtractionError("XPDF pdftotext binary is not installed") from exc

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=settings.XPDF_PDFTOTEXT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as exc:
            process.kill()
            await process.communicate()
            logger.error("XPDF text extraction timed out", exc_info=True)
            raise PDFTextExtractionError("PDF text extraction timed out") from exc

        if process.returncode != 0:
            error_output = stderr.decode("utf-8", errors="replace").strip()
            logger.error(f"XPDF text extraction failed: {error_output}")
            raise PDFTextExtractionError("Failed to extract text from PDF")

        return stdout.decode("utf-8", errors="replace").strip()

    @staticmethod
    def _remove_temp_file(file_path: str) -> None:
        """Delete a temporary file, logging cleanup errors without failing."""
        try:
            os.remove(file_path)
        except FileNotFoundError:
            return
        except OSError as exc:
            logger.warning(f"Failed to remove temporary PDF file {file_path}: {str(exc)}")
