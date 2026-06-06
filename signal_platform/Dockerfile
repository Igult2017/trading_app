FROM python:3.11-slim

# System deps for mplfinance chart generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender-dev libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/signal_platform

COPY signal_platform/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY signal_platform/ .

CMD ["python", "main.py"]
