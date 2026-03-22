# MediCentral backend (Django + Daphne + Channels)
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=medicentral.settings

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Statik fayllar (admin) — runtime kaliti muhitda beriladi
ARG DJANGO_SECRET_KEY=docker-build-collectstatic-only
ENV DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
RUN DJANGO_DEBUG=true python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate --noinput && exec daphne -b 0.0.0.0 -p 8000 medicentral.asgi:application"]
