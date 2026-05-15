from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.api.deps import get_current_active_user
from app.core.logging import logger
from app.models.user import User
from app.parsers.pdf import PDFTextExtractionError, XPDFParser

"""Resume-related API endpoints."""

router = APIRouter()


@router.post("/extract-text")
async def extract_resume_text(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """Extract text from an uploaded resume PDF using XPDF.

    Requires a valid bearer token. The uploaded file must be a PDF and is read
    into memory before being passed to the XPDF parser. The response includes
    the original filename and extracted UTF-8 text so the frontend can preview
    or send it into later optimization workflows.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported",
        )

    try:
        pdf_bytes = await file.read()
        text = await XPDFParser.extract_text(pdf_bytes)
        logger.info(f"Extracted PDF text for user {current_user.email}")
        return {
            "filename": file.filename,
            "text": text,
        }
    except PDFTextExtractionError as exc:
        logger.warning(f"PDF text extraction failed for {file.filename}: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error(f"Unexpected PDF extraction error: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while extracting PDF text",
        )
