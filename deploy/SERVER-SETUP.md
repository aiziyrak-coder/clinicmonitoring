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

**nginx versiyasi:** repodagi konfig `http2 on;` (nginx **1.25+**). Agar serverda **nginx 1.18** (Ubuntu 22.04 standart) bo‘lsa va `nginx -t` xato bersa, `server` bloklarida `listen 443 ssl;` + `http2 on;` o‘rniga `listen 443 ssl http2;` qoldiring.

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

## 8. Qurilmalar (HL7, Creative Medical K12)

- **Server IP / port:** monitor menyusida server manzili (`167.71.53.238` yoki sizning VPS IP) va **6006**, **HL7 protocol** yoqilgan bo‘lsin.
- **Baza:** deploydan keyin `python manage.py setup_real_hl7_monitor` avtomatik ishlaydi (real qurilma `hl7_real` + bemor `cm-k12-001`, karavat `cm_hl7_bed`). Ismni o‘zgartirish:  
  `python manage.py setup_real_hl7_monitor --patient-name "Familiya Ism"`
- **NAT / boshqa tarmoq:** server TCP manba IP sini **192.168.0.228** ko‘rmasa, `journalctl -u clinicmonitoring-daphne -n 40` da `HL7: manzil mos kelmedi` yoki `peer=` qatorini qiling; keyin:  
  `python manage.py setup_real_hl7_monitor --peer-ip <shu_IP>` yoki Admin → MonitorDevice → **hl7_peer_ip**.
- **Mock emas:** `.env` da `MONITORING_SIMULATION_ENABLED=false` (deploy skripti qo‘shadi).

Firewall: **6006/tcp** ochiq bo‘lishi kerak (`ufw allow 6006/tcp`).

## 9. Masofadan to‘liq yangilash (bitta buyruq)

Lokal mashinada `paramiko` o‘rnating: `pip install paramiko`.

```powershell
cd D:\medicentral   # yoki loyiha ildizi
$env:SSH_PASSWORD = "server-root-paroli"
python deploy/deploy_remote.py update
```

- **update** — `git pull` (origin/main), `migrate`, `collectstatic`, `ensure_fjsti_login`, frontend `npm ci` + `build`, **HTTPS bo‘lsa** `nginx-clinicmonitoring.conf`, Daphne **8012** qayta ishga tushadi.
- **Birinchi o‘rnatish** (toza server, apt, redis, certbot): `python deploy/deploy_remote.py bootstrap`

Eski skript nomlari: `ssh_finish.py` → `update`, `ssh_deploy.py` → `bootstrap`.

`GEMINI_API_KEY` va boshqa maxfiy kalitlar faqat serverdagi `backend/.env` da qoladi — repoga kirmaydi.

**Rasm orqali qurilma (Gemini Vision):** [Google AI Studio](https://aistudio.google.com/apikey) dan kalit oling. Serverda:

- `nano /opt/clinicmonitoring/backend/.env` → `GEMINI_API_KEY=...` qatorini qo‘shing, keyin `sudo systemctl restart clinicmonitoring-daphne`
- yoki masofadan: `set DEPLOY_GEMINI_KEY=<kalit>` va `set SSH_PASSWORD=...` sozlab `python deploy/deploy_remote.py update` — kalit `.env` ga yoziladi va Daphne qayta ishga tushadi.

---

**Django admin CSS:** `collectstatic` + WhiteNoise `whitenoise.middleware.WhiteNoiseMiddleware` — nginx orqali `/static/` Daphne ga proksi qilingan (yuqoridagi konfig).

**Alohida API domeni:** brauzer ilovasi uchun **asosiy kirish** `https://clinicmonitoring.ziyrak.org` (bir xil origin cookie uchun).
