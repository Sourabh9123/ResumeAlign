FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OCR and LaTeX
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    texlive-xetex \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    wget \
    && rm -rf /var/lib/apt/lists/*

# XPDF tools (pdftotext, etc.) are already provided by poppler-utils installed above

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
