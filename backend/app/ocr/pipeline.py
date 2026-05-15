import asyncio
import pytesseract
from PIL import Image
import io

class OCRPipeline:
    @staticmethod
    async def extract_text_from_image(image_bytes: bytes) -> str:
        # Simulate async execution of synchronous OCR
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, OCRPipeline._process_image, image_bytes)

    @staticmethod
    def _process_image(image_bytes: bytes) -> str:
        image = Image.open(io.BytesIO(image_bytes))
        # Basic preprocessing could be added here via OpenCV
        text = pytesseract.image_to_string(image)
        return text
