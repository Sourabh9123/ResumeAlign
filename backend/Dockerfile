FROM python:3.11-slim

WORKDIR /app

ARG XPDF_VERSION=4.05

# Install system dependencies for OCR and LaTeX
RUN apt-get update && apt-get install -y \
    ca-certificates \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    texlive-xetex \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install official XPDF command-line binaries (pdftotext, pdfinfo, pdftoppm, etc.).
RUN wget -q "https://dl.xpdfreader.com/xpdf-tools-linux-${XPDF_VERSION}.tar.gz" -O /tmp/xpdf-tools.tar.gz \
    && tar -xzf /tmp/xpdf-tools.tar.gz -C /tmp \
    && cp /tmp/xpdf-tools-linux-${XPDF_VERSION}/bin64/* /usr/local/bin/ \
    && chmod +x /usr/local/bin/pdf* \
    && rm -rf /tmp/xpdf-tools.tar.gz /tmp/xpdf-tools-linux-${XPDF_VERSION}

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
