# Pull base image
FROM python:3.11.5-slim-bullseye

# Set environment variables
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN sed -i 's/deb.debian.org/ftp.fr.debian.org/g' /etc/apt/sources.list && \
    apt-get update && apt-get install -y --fix-missing\
    postgresql-client \
    libpq-dev \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /code

# Install Python dependencies
COPY ./requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

# Create directories for static and media files
RUN mkdir -p /code/staticfiles /code/mediafiles

# Expose port
EXPOSE 8000

# Copy project
COPY . .