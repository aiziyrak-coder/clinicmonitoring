# ClinicMonitoring

Monitoring ilovasi: **frontend** (Vite + React) va **backend** (Django REST Framework + Django Channels + Daphne).

**GitHub:** [aiziyrak-coder/clinicmonitoring](https://github.com/aiziyrak-coder/clinicmonitoring)

**Production:** `deploy/SERVER-SETUP.md` va `deploy/nginx-clinicmonitoring.conf`. Masofadan yangilash: `python deploy/deploy_remote.py update` (`paramiko`, `SSH_PASSWORD`).

## Tuzilma

| Papka | Vazifa |
|--------|--------|
| `frontend/` | React UI, `npm run dev` (odatda `http://127.0.0.1:5173`) |
| `backend/` | REST API (`/api/...`), WebSocket (`/ws/monitoring/`), simulyatsiya |
| `k8s/` | Kubernetes namunalari (Django 8000, Redis, Ingress) |
| `.github/workflows/` | CI: frontend build + backend check/migrate + Docker build |

**Muhit o‘zgaruvchilari:** `backend/.env.example`, `frontend/.env.example`.

## Mahalliy ishga tushirish

**1. Backend**

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
```

Agar `table already exists` (eski `syncdb`): `python manage.py migrate --fake-initial`

```bash
# Ixtiyoriy demo ma'lumot (faqat sinov uchun)
# python manage.py seed_demo

# Real test: barcha mock/demo yozuvlarni o'chirish
# python manage.py clear_monitoring_data

daphne -b 127.0.0.1 -p 8000 medicentral.asgi:application
```

**2. Frontend** (alohida terminal)

```bash
cd frontend
npm install
npm run dev
```

Brauzer: `http://127.0.0.1:5173` — Vite `vite.config.ts` orqali `/api` va `/ws` ni `127.0.0.1:8000` ga yo‘naltiradi.

**Simulyatsiya** faqat ASGI server jarayonida (`daphne` / `runserver` bolasi); `migrate`, `shell` va hokazoda ishga tushmaydi.

## Production / alohida domen

- **Frontend** statik hosting (masalan CDN) va **backend** alohida domen bo‘lsa, `frontend/.env` da:
  - `VITE_BACKEND_ORIGIN=https://api.sizning-domen.uz`
- So‘ng `npm run build` — `apiUrl()` va WebSocket `wss://` avtomatik backend manziliga ulanadi.

**Backend** (`DJANGO_DEBUG=false`):

- `DJANGO_SECRET_KEY` — majburiy, tasodifiy uzun qator.
- `DJANGO_ALLOWED_HOSTS` — API domenlari (vergul bilan).
- `CORS_ALLOWED_ORIGINS` — frontend HTTPS URL (vergul bilan).
- `DJANGO_CSRF_TRUSTED_ORIGINS` — admin/formalar uchun kerak bo‘lsa.
- **Bir nechta server/pod:** `REDIS_URL` + `channels-redis` (WebSocket kanallari sinxroni); aks holda faqat bitta jarayonda InMemory ishlaydi.

**Teskari proksi (nginx / Ingress):** `DJANGO_BEHIND_PROXY=true`, kerak bo‘lsa `DJANGO_SECURE_SSL_REDIRECT=true`.

## Docker Compose

```bash
docker compose up --build
```

Backend: `http://127.0.0.1:8000`, SQLite `/app/data`, Redis ichki tarmoqda. `REDIS_URL` avtomatik beriladi.

## Kubernetes

Tartib:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/deployment.yaml
```

`k8s/deployment.yaml` dagi `DJANGO_SECRET_KEY` va `CORS_ALLOWED_ORIGINS` ni production uchun almashtiring. Bir nechta backend replikasi uchun **Redis Service** (`redis.yaml`) majburiy.

## HL7 qurilmalar (TCP / port 6006)

Backend **MLLP** tinglovchisini ishga tushiradi (`monitoring.apps` orqali): `HL7_LISTEN_HOST` (odatda `0.0.0.0`), `HL7_LISTEN_PORT` (odatda **6006**). Qurilma sozlamalaridagi **Server IP** MediCentral serverining tarmoq manzili bo‘lishi kerak; **port** serverdagi tinglovchi port bilan mos kelishi kerak.

Qurilma ro‘yxatida **qurilma IP** (TCP ulanish manba IP) saqlanadi — HL7 xabar kelganda shu manzil bo‘yicha taniladi. Bemor vitallari uchun qurilmani **joy (bed)** ga biriktiring va shu joyda bemorni qabul qiling.

**Ulanish tekshiruvi:** Sozlamalar → Qurilmalar → **radio** tugmasi yoki `GET /api/devices/<id>/connection-check/` — HL7 tinglovchi, oxirgi paket vaqti, joy/bemor zanjiri va ogohlantirishlar.

## Sog‘liq tekshiruvi

`GET /api/health/` — `200`, jismoniy: `{"status":"ok","database":"connected"}`. DB ulanmasa — `503`.

## CI

GitHub Actions: `frontend` (npm ci, lint, build), `backend` (pip, check, migrate, health smoke), `docker-backend` (image build). Registry push va klaster deploy — o‘zingizning `secrets` bilan qo‘shiladi.

## Xavfsizlik eslatmalari

- `DEBUG=false` da standart `SECRET_KEY` ishlatilmaydi.
- `CORS_ALLOW_ALL_ORIGINS` faqat `DEBUG=true` da yoqiladi.
- SQLite faylini backup qiling; yuk ko‘p bo‘lsa `DATABASE_URL` (PostgreSQL) ishlating.
