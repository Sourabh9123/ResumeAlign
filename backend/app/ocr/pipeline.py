import asyncio
import pytesseract
from PIL import Image
import io
from app.core.logging import logger

class OCRPipeline:
    @staticmethod
    async def extract_text_from_image(image_bytes: bytes) -> str:
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, OCRPipeline._process_image, image_bytes)
        except Exception as e:
            logger.error(f"Failed to execute OCR process: {str(e)}", exc_info=True)
            raise Exception("Failed to extract text from image")

    @staticmethod
    def _process_image(image_bytes: bytes) -> str:
        try:
            image = Image.open(io.BytesIO(image_bytes))
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            logger.error(f"OCR image processing error: {str(e)}", exc_info=True)
            raise ValueError("Invalid image data or OCR failure")
