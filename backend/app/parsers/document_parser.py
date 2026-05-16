import asyncio
import io
import tempfile
from abc import ABC, abstractmethod
from typing import Optional

import docx
import pdfplumber
from fastapi import UploadFile

from app.core.logging import logger
from app.ocr.pipeline import OCRPipeline


class BaseParser(ABC):
    """Abstract base class for all document parsers."""

    @abstractmethod
    async def extract_text(self, file: UploadFile) -> str:
        """Extract text from the given uploaded file."""
        pass


class TextParser(BaseParser):
    """Parser for plain text files."""

    async def extract_text(self, file: UploadFile) -> str:
        try:
            content = await file.read()
            text = content.decode("utf-8")
            logger.info("Successfully extracted text from TXT file")
            return text.strip()
        except UnicodeDecodeError as e:
            logger.error("Failed to decode TXT file as UTF-8", exc_info=True)
            raise ValueError("Text file must be valid UTF-8 encoded") from e
        except Exception as e:
            logger.error(f"Error reading TXT file: {str(e)}", exc_info=True)
            raise RuntimeError("Failed to parse text document") from e
        finally:
            await file.seek(0)


class PDFParser(BaseParser):
    """Parser for PDF files using pdfplumber with a pdftotext (poppler) fallback."""

    async def extract_text(self, file: UploadFile) -> str:
        try:
            content = await file.read()
            text = await self._extract_with_pdfplumber(content)

            # If pdfplumber extracted too little text, it might be an image-based PDF or poorly formatted.
            # We can fallback to pdftotext here if we want, but pdfplumber is usually very good.
            # If it's completely empty, we might need to OCR the PDF (not implemented in this step).
            if not text or len(text.strip()) < 50:
                logger.warning("PDF extracted very little text, attempting XPDF (pdftotext) fallback")
                fallback_text = await self._extract_with_pdftotext(content)
                if fallback_text and len(fallback_text.strip()) > len(text.strip()):
                    text = fallback_text

            logger.info(f"Successfully extracted {len(text)} characters from PDF")
            return text.strip()
        except Exception as e:
            logger.error(f"Error parsing PDF file: {str(e)}", exc_info=True)
            raise RuntimeError("Failed to parse PDF document") from e
        finally:
            await file.seek(0)

    async def _extract_with_pdfplumber(self, content: bytes) -> str:
        """Extract text using python's pdfplumber library."""

        def sync_extract():
            text_blocks = []
            links = []
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text(x_tolerance=2, y_tolerance=3)
                    if page_text:
                        text_blocks.append(page_text)
                    if page.hyperlinks:
                        for hl in page.hyperlinks:
                            if "uri" in hl and hl["uri"]:
                                links.append(hl["uri"])

            full_text = "\n\n".join(text_blocks)
            if links:
                unique_links = list(set(links))
                full_text += "\n\n--- Extracted Hyperlinks ---\n" + "\n".join(unique_links)
            return full_text

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_extract)

    async def _extract_with_pdftotext(self, content: bytes) -> str:
        """Extract text using XPDF's pdftotext command line utility (via poppler-utils)."""
        with tempfile.NamedTemporaryFile(suffix=".pdf") as temp_pdf:
            temp_pdf.write(content)
            temp_pdf.flush()

            process = await asyncio.create_subprocess_exec(
                "pdftotext",
                "-layout",  # preserve layout
                temp_pdf.name,
                "-",  # output to stdout
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                logger.warning(f"pdftotext fallback failed: {stderr.decode()}")
                return ""

            return stdout.decode("utf-8", errors="ignore")


class DocxParser(BaseParser):
    """Parser for Microsoft Word (.docx) files."""

    async def extract_text(self, file: UploadFile) -> str:
        try:
            content = await file.read()

            def sync_extract():
                doc = docx.Document(io.BytesIO(content))
                return "\n".join([para.text for para in doc.paragraphs])

            loop = asyncio.get_event_loop()
            text = await loop.run_in_executor(None, sync_extract)

            logger.info("Successfully extracted text from DOCX file")
            return text.strip()
        except Exception as e:
            logger.error(f"Error parsing DOCX file: {str(e)}", exc_info=True)
            raise RuntimeError("Failed to parse DOCX document") from e
        finally:
            await file.seek(0)


class ImageParser(BaseParser):
    """Parser for Image files using the OCR pipeline."""

    async def extract_text(self, file: UploadFile) -> str:
        try:
            content = await file.read()
            text = await OCRPipeline.extract_text_from_image(content)
            logger.info("Successfully extracted text from Image via OCR")
            return text.strip()
        except Exception as e:
            logger.error(f"Error parsing Image file: {str(e)}", exc_info=True)
            raise RuntimeError("Failed to run OCR on image") from e
        finally:
            await file.seek(0)


class DocumentParserFactory:
    """Factory to return the appropriate parser based on file type."""

    @staticmethod
    def get_parser(filename: str, content_type: Optional[str] = None) -> BaseParser:
        filename_lower = filename.lower()

        if filename_lower.endswith(".pdf") or content_type == "application/pdf":
            return PDFParser()
        elif filename_lower.endswith(".docx") or content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return DocxParser()
        elif filename_lower.endswith(".txt") or content_type == "text/plain":
            return TextParser()
        elif filename_lower.endswith((".png", ".jpg", ".jpeg")) or (content_type and content_type.startswith("image/")):
            return ImageParser()
        else:
            logger.warning(f"Unsupported file format requested: {filename} ({content_type})")
            raise ValueError("Unsupported file format for document parsing. Supported formats: PDF, DOCX, TXT, PNG/JPG.")
