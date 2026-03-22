# ClinicMonitoring — server o‘rnatish (Ubuntu 22.04+)

**Xavfsizlik:** root parolni chatda yozmang; SSH kalit ishlating. `GEMINI_API_KEY` faqat serverdagi `backend/.env` da.

## 1. Loyihani joylash

```bash
sudo mkdir -p /opt/clinicmonitoring && sudo chown $USER:$USER /opt/clinicmonitoring
cd /opt/clinicmonitoring
git clone https://github.com/aiziyrak-coder/clinicmonitoring.git .
```

## 2. Python Virtualenv va backend

```bash
cd /opt/clinicmonitoring/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env   # quyidagi bo‘limni to‘ldiring
```

**Minimal `.env` (production):**

```env
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<uzun-tasodifiy-qator>
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,clinicmonitoring.ziyrak.org,clinicmonitoringapi.ziyrak.org,167.71.53.238
DJANGO_CSRF_TRUSTED_ORIGINS=https://clinicmonitoring.ziyrak.org,https://clinicmonitoringapi.ziyrak.org
CORS_ALLOWED_ORIGINS=https://clinicmonitoring.ziyrak.org
DJANGO_BEHIND_PROXY=true
DJANGO_SESSION_COOKIE_SECURE=true
DJANGO_CSRF_COOKIE_SECURE=true
GEMINI_API_KEY=<Google AI Studio kaliti>
DJANGO_SQLITE_PATH=/opt/clinicmonitoring/backend/data/db.sqlite3
```

```bash
mkdir -p /opt/clinicmonitoring/backend/data
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py ensure_fjsti_login
```

**Kirish:** `FJSTI` / `admin123` (superuser + Django admin).

## 3. Redis (WebSocket ko‘p worker uchun tavsiya)

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

`.env` ga qo‘shing: `REDIS_URL=redis://127.0.0.1:6379/0`

## 4. Frontend build

```bash
cd /opt/clinicmonitoring/frontend
npm ci
# Bir xil origin (nginx /api proksi) — VITE_BACKEND_ORIGIN bo‘sh qoldiring
npm run build
sudo mkdir -p /var/www/clinicmonitoring/frontend/dist
sudo rsync -a dist/ /var/www/clinicmonitoring/frontend/dist/
sudo chown -R www-data:www-data /var/www/clinicmonitoring/frontend/dist
```

## 5. systemd (Daphne)

**Bir nechta backend** bitta serverda bo‘lsa, `127.0.0.1:8000` boshqa loyiha (Gunicorn) bilan band bo‘lishi mumkin. Repodagi standart sozlama **8012** portida Daphne ishga tushadi; nginx `upstream` ham shu portga mos keladi.

```bash
sudo cp /opt/clinicmonitoring/deploy/clinicmonitoring-daphne.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now clinicmonitoring-daphne
sudo systemctl status clinicmonitoring-daphne
```

`User=www-data` bo‘lsa, `data/` va `db.sqlite3` uchun `chown`/`chmod` bering.

## 6. nginx + HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /opt/clinicmonitoring/deploy/nginx-clinicmonitoring.conf /etc/nginx/sites-available/clinicmonitoring
sudo ln -sf /etc/nginx/sites-available/clinicmonitoring /etc/nginx/sites-enabled/
sudo nginx -t
```

**certbot** (domenlar DNS bilan IP ga tushganini tekshiring):

```bash
sudo certbot certonly --nginx -d clinicmonitoring.ziyrak.org -d clinicmonitoringapi.ziyrak.org
```

Sertifikat yo‘llari `nginx-clinicmonitoring.conf` dagi bilan mos kelishi kerak.

```bash
sudo systemctl reload nginx
```

## 7. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 6006/tcp   # HL7 qurilmalar
sudo ufw enable
```

## 8. Qurilmalar

Monitor **Server IP** sifatida **167.71.53.238** (yoki tashqi IP), port **6006** — trafik serverga kelishi kerak.

---

**Django admin CSS:** `collectstatic` + WhiteNoise `whitenoise.middleware.WhiteNoiseMiddleware` — nginx orqali `/static/` Daphne ga proksi qilingan (yuqoridagi konfig).

**Alohida API domeni:** brauzer ilovasi uchun **asosiy kirish** `https://clinicmonitoring.ziyrak.org` (bir xil origin cookie uchun).
