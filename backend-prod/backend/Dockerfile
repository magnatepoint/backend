FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_HOME=/app

WORKDIR ${APP_HOME}

# Install system dependencies including Redis
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libpq-dev \
        libmagic1 \
        libmagic-dev \
        redis-server \
        procps \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt

RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# Make entrypoint script executable
RUN chmod +x docker-entrypoint.sh

EXPOSE 7000

# Use entrypoint script to start Redis, Celery, and FastAPI
CMD ["./docker-entrypoint.sh"]

