FROM python:3.11-slim

# Dependencias del sistema para OpenCV, Pillow y PaddleOCR
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    libglib2.0-dev \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar requirements primero (cache de capas Docker)
COPY requirements.txt .

# Instalar dependencias Python
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY . .

# Puerto que usa Render por defecto
EXPOSE 8001

# Levantar servidor
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
