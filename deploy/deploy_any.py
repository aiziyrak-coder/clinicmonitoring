#!/usr/bin/env python3
"""
Universal Server Deploy — barcha loyihalar uchun.

Ishlatish:
  Windows (tavsiya — .py boshqa dasturda ochilmasin):
    deploy/RUN_DEPLOY_ANY.bat clinicmonitoring

  python deploy_any.py onlinetest
  python deploy_any.py medoraai
  python deploy_any.py phoenix
  python deploy_any.py tergov
  python deploy_any.py advokat
  python deploy_any.py clinicmonitoring

  python deploy_any.py --list          # Barcha loyihalar ro'yxati
  python deploy_any.py --status        # Barcha servislar holati
  python deploy_any.py NAME --check    # Faqat holat tekshirish
"""
import sys, io, os, argparse, select, time, pathlib

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import paramiko
except ImportError:
    print("pip install paramiko")
    sys.exit(1)

HOST = os.environ.get("DEPLOY_HOST", "167.71.53.238")
USER = os.environ.get("DEPLOY_USER", "root")
PASS = os.environ.get("DEPLOY_PASS", "")

# ─── LOYIHALAR KONFIGURATSIYASI ────────────────────────────────────────────────
PROJECTS = {
    "clinicmonitoring": {
        "dir":        "/opt/clinicmonitoring",
        "backend":    "/opt/clinicmonitoring/backend",
        "frontend":   "/opt/clinicmonitoring/frontend",
        "venv":       "/opt/clinicmonitoring/backend/.venv",
        "services":   ["clinicmonitoring-daphne", "clinicmonitoring-hl7-gateway", "clinicmonitoring-vitals-api"],
        "migrate":    True,
        "collectstatic": True,
        "npm_build":  True,
        "static_dest": "/var/www/clinicmonitoring",
        "desc":       "MediCentral klinika monitoring",
        "urls":       ["https://clinicmonitoring.ziyrak.org", "https://clinicmonitoringapi.ziyrak.org/api/health/"],
    },
    "onlinetest": {
        "dir":        "/var/www/onlinetest",
        "backend":    "/var/www/onlinetest/backend",
        "frontend":   "/var/www/onlinetest/frontend",
        "venv":       "/var/www/onlinetest/backend/.venv",
        "services":   ["onlinetest-api", "onlinetest-realtime"],
        "migrate":    True,
        "collectstatic": True,
        "npm_build":  True,
        "static_dest": None,
        "desc":       "FJSTI Online imtihon platformasi",
        "urls":       [],
    },
    "medoraai": {
        "dir":        "/root/medoraai",
        "backend":    "/root/medoraai/backend",
        "frontend":   "/root/medoraai/frontend",
        "venv":       "/root/medoraai/backend/venv",
        "services":   ["medoraai-backend-8001"],
        "migrate":    True,
        "collectstatic": True,
        "npm_build":  True,
        "static_dest": "/var/www/medoraai",
        "desc":       "MedoraAI tibbiy AI platforma",
        "urls":       [],
    },
    "phoenix": {
        "dir":        "/phonix",
        "backend":    "/phonix/backend",
        "frontend":   None,
        "venv":       "/phonix/backend/venv",
        "services":   ["phoenix-backend"],
        "migrate":    True,
        "collectstatic": True,
        "npm_build":  False,
        "static_dest": None,
        "desc":       "Phoenix backend",
        "urls":       [],
    },
    "tergov": {
        "dir":        "/var/www/tergov",
        "backend":    None,
        "frontend":   "/var/www/tergov",
        "venv":       None,
        "services":   ["tergov"],
        "migrate":    False,
        "collectstatic": False,
        "npm_build":  True,
        "static_dest": None,
        "desc":       "Tergov AI platforma (Next.js/React)",
        "urls":       [],
    },
    "advokat": {
        "dir":        "/opt/advokat",
        "backend":    "/opt/advokat/backend",
        "frontend":   "/opt/advokat/frontend",
        "venv":       "/opt/advokat/backend/venv",
        "services":   ["advokat-backend"],
        "migrate":    True,
        "collectstatic": True,
        "npm_build":  True,
        "static_dest": None,
        "desc":       "Advokat platformasi",
        "urls":       ["https://advokat.cdcgroup.uz"],
    },
    "antifishingbot": {
        "dir":        "/opt/antifishingbot",
        "backend":    "/opt/antifishingbot",
        "frontend":   None,
        "venv":       "/opt/antifishingbot/venv",
        "services":   ["antifishingbot"],
        "migrate":    False,
        "collectstatic": False,
        "npm_build":  False,
        "static_dest": None,
        "desc":       "Anti-fishing Telegram bot",
        "urls":       [],
    },
    "smartcity": {
        "dir":        "/var/www/smartcity-backend",
        "backend":    "/var/www/smartcity-backend",
        "frontend":   "/var/www/smartcity-frontend",
        "venv":       "/var/www/smartcity-backend/venv",
        "services":   [],
        "migrate":    True,
        "collectstatic": True,
        "npm_build":  True,
        "static_dest": None,
        "desc":       "SmartCity platforma",
        "urls":       [],
    },
}


# ─── SSH ──────────────────────────────────────────────────────────────────────
def _load_pkey(path: pathlib.Path):
    """id_rsa / id_ed25519 uchun to'g'ri parser."""
    try:
        if "ed25519" in path.name.lower():
            return paramiko.Ed25519Key.from_private_key_file(str(path))
        return paramiko.RSAKey.from_private_key_file(str(path))
    except Exception:
        try:
            return paramiko.Ed25519Key.from_private_key_file(str(path))
        except Exception:
            return None


def ssh_connect(password=None):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if password is not None:
        pw = password
    else:
        pw = PASS or ""
    pkey = None
    for key_path in [
        pathlib.Path.home() / ".ssh" / "id_rsa",
        pathlib.Path.home() / ".ssh" / "id_ed25519",
    ]:
        if key_path.exists():
            pkey = _load_pkey(key_path)
            if pkey:
                break
    try:
        c.connect(
            HOST,
            username=USER,
            password=pw if pkey is None else None,
            pkey=pkey,
            timeout=30,
            banner_timeout=30,
        )
    except Exception as exc:
        print(f"\033[31m  [ERR] SSH ulanmadi: {exc}\033[0m")
        print("  Parol: set DEPLOY_PASS=...  yoki  python deploy_any.py NAME --password ...")
        print("  Windows: deploy\\RUN_DEPLOY_ANY.bat NAME  (boshqa dastur .py ochmasin)\n")
        raise
    return c


def run(c, cmd, timeout=120, label=None):
    if label:
        print(f"  \033[2m$ {label}\033[0m")
    transport = c.get_transport()
    chan = transport.open_session()
    chan.settimeout(timeout)
    chan.exec_command(cmd)
    out = b""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r, _, _ = select.select([chan], [], [], 2)
        if r and chan.recv_ready():
            out += chan.recv(8192)
        if chan.exit_status_ready():
            while chan.recv_ready():
                out += chan.recv(8192)
            break
    code = chan.recv_exit_status()
    chan.close()
    return code, out.decode(errors="replace").strip()


def ok(msg):   print(f"\033[32m  [OK ] {msg}\033[0m")
def err(msg):  print(f"\033[31m  [ERR] {msg}\033[0m")
def warn(msg): print(f"\033[33m  [!  ] {msg}\033[0m")
def hdr(msg):  print(f"\n\033[1;34m{'─'*54}\n  {msg}\n{'─'*54}\033[0m")


# ─── DEPLOY FUNKSIYALARI ──────────────────────────────────────────────────────
def git_pull(c, proj_dir):
    hdr("GIT PULL")
    code, out = run(c, f"cd {proj_dir} && git pull 2>&1", timeout=60, label="git pull")
    # Birinchi 3 qator
    for line in out.splitlines()[:5]:
        print(f"    {line}")
    if code == 0:
        ok("git pull")
    else:
        warn(f"git pull xato (kod {code}), davom etilmoqda")


def pip_install(c, venv, backend_dir):
    hdr("PIP INSTALL")
    req_file = f"{backend_dir}/requirements.txt"
    code, _ = run(c, f"test -f {req_file}", timeout=5)
    if code != 0:
        warn("requirements.txt topilmadi, o'tkazildi")
        return
    code, out = run(c,
        f"{venv}/bin/pip install --quiet --upgrade pip 2>&1 && "
        f"{venv}/bin/pip install --quiet -r {req_file} 2>&1 | tail -3",
        timeout=180, label="pip install")
    for line in out.splitlines()[-3:]:
        print(f"    {line}")
    ok("pip install") if code == 0 else warn(f"pip xato: {out[:100]}")


def django_migrate(c, venv, backend_dir):
    hdr("MIGRATE")
    code, out = run(c,
        f"cd {backend_dir} && {venv}/bin/python manage.py migrate --noinput 2>&1 | tail -5",
        timeout=60, label="migrate")
    for line in out.splitlines()[-3:]:
        print(f"    {line}")
    ok("migrate") if code == 0 else err(f"migrate xato: {out[:200]}")


def django_collectstatic(c, venv, backend_dir):
    hdr("COLLECTSTATIC")
    code, out = run(c,
        f"cd {backend_dir} && {venv}/bin/python manage.py collectstatic --noinput 2>&1 | tail -3",
        timeout=60, label="collectstatic")
    ok("collectstatic") if code == 0 else warn(f"collectstatic: {out[:100]}")


def npm_build(c, frontend_dir, static_dest=None):
    hdr("FRONTEND BUILD")
    # package.json borligini tekshirish
    code, _ = run(c, f"test -f {frontend_dir}/package.json", timeout=5)
    if code != 0:
        warn("package.json topilmadi, o'tkazildi")
        return

    code, out = run(c,
        f"cd {frontend_dir} && npm ci --silent 2>&1 | tail -3",
        timeout=300, label="npm ci")
    for line in out.splitlines()[-2:]:
        print(f"    {line}")

    code, out = run(c,
        f"cd {frontend_dir} && npm run build 2>&1 | tail -5",
        timeout=300, label="npm build")
    for line in out.splitlines()[-4:]:
        print(f"    {line}")

    if code == 0:
        ok("frontend build")
        if static_dest:
            run(c, f"mkdir -p {static_dest} && rsync -a --delete {frontend_dir}/dist/ {static_dest}/ 2>&1",
                timeout=30)
            ok(f"rsync -> {static_dest}")
    else:
        err(f"build xato: {out[:200]}")


def restart_services(c, services):
    hdr("SERVISLARNI RESTART")
    for svc in services:
        code, _ = run(c,
            f"systemctl is-enabled {svc} 2>/dev/null | grep -q enabled || systemctl enable {svc} 2>/dev/null; "
            f"systemctl restart {svc} 2>&1",
            timeout=20, label=f"restart {svc}")
        time.sleep(2)
        _, st = run(c, f"systemctl is-active {svc}", timeout=5)
        icon = ok if st.strip() == "active" else err
        icon(f"{svc}: {st.strip()}")


def check_status(c, proj):
    hdr("HOLAT TEKSHIRUVI")
    cfg = PROJECTS[proj]
    for svc in cfg["services"]:
        _, st = run(c, f"systemctl is-active {svc}", timeout=5)
        (ok if st.strip() == "active" else err)(f"{svc}: {st.strip()}")

    # URL tekshirish
    for url in cfg.get("urls", []):
        _, resp = run(c, f"curl -sf --max-time 5 {url} 2>/dev/null | head -c 100 || echo XATO", timeout=10)
        icon = "OK" if "XATO" not in resp else "ERR"
        print(f"    [{icon}] {url}")
        if icon == "OK" and resp:
            print(f"          {resp[:80]}")


# ─── ASOSIY DEPLOY ────────────────────────────────────────────────────────────
def deploy(c, proj_name):
    cfg = PROJECTS[proj_name]
    print(f"\n\033[1;36m{'='*54}")
    print(f"  Deploy: {proj_name}  ({cfg['desc']})")
    print(f"{'='*54}\033[0m")

    proj_dir    = cfg["dir"]
    backend_dir = cfg.get("backend")
    frontend_dir= cfg.get("frontend")
    venv        = cfg.get("venv")
    services    = cfg.get("services", [])

    # 1. Git pull
    code, _ = run(c, f"test -d {proj_dir}/.git", timeout=5)
    if code == 0:
        git_pull(c, proj_dir)
    else:
        warn(f"{proj_dir}/.git topilmadi — git pull o'tkazildi")

    # 2. Backend
    if backend_dir and venv:
        code, _ = run(c, f"test -d {venv}", timeout=5)
        if code != 0:
            hdr("VENV YARATISH")
            run(c, f"python3 -m venv {venv} 2>&1", timeout=60, label="venv create")
            ok("venv yaratildi")

        pip_install(c, venv, backend_dir)

        if cfg.get("migrate"):
            django_migrate(c, venv, backend_dir)

        if cfg.get("collectstatic"):
            django_collectstatic(c, venv, backend_dir)

    # 3. Frontend
    if frontend_dir and cfg.get("npm_build"):
        npm_build(c, frontend_dir, cfg.get("static_dest"))

    # 4. Servislar
    if services:
        restart_services(c, services)

    # 5. Tekshiruv
    check_status(c, proj_name)

    print(f"\n\033[1;32m{'='*54}\n  {proj_name} deploy tugadi!\n{'='*54}\033[0m\n")


def all_status(c):
    print(f"\n\033[1;36m{'='*54}")
    print(f"  BARCHA LOYIHALAR HOLATI — {HOST}")
    print(f"{'='*54}\033[0m\n")
    all_svcs: list[str] = []
    for _proj, cfg in PROJECTS.items():
        all_svcs.extend(cfg.get("services", []))
    seen: set[str] = set()
    for svc in all_svcs:
        if svc in seen:
            continue
        seen.add(svc)
        _, st = run(c, f"systemctl is-active {svc} 2>/dev/null", timeout=10)
        line = st.strip() or "unknown"
        (ok if line == "active" else err)(f"{svc}: {line}")


# ─── CLI ──────────────────────────────────────────────────────────────────────
def main():
    global HOST
    parser = argparse.ArgumentParser(description="Universal server deploy")
    parser.add_argument("project", nargs="?", help="Loyiha nomi")
    parser.add_argument("--list",     action="store_true", help="Loyihalar ro'yxati")
    parser.add_argument("--status",   action="store_true", help="Barcha servislar holati")
    parser.add_argument("--check",    action="store_true", help="Faqat tekshirish")
    parser.add_argument("--password", default=None,        help="SSH paroli")
    parser.add_argument("--host",     default=HOST,        help=f"Server IP (default {HOST})")
    args = parser.parse_args()

    HOST = args.host

    if args.list:
        print(f"\nMavjud loyihalar ({HOST}):\n")
        for name, cfg in PROJECTS.items():
            svcs = ", ".join(cfg.get("services", ["-"]))
            print(f"  {name:<20} {cfg['desc']}")
            print(f"  {'':20} Dir: {cfg['dir']}   Servis: {svcs}\n")
        return

    if not args.project and not args.status:
        parser.print_help()
        return

    c = ssh_connect(args.password)
    ok(f"SSH ulandi: {USER}@{HOST}")

    try:
        if args.status or not args.project:
            all_status(c)
            return

        proj = args.project.lower()
        if proj not in PROJECTS:
            err(f"Loyiha topilmadi: {proj}")
            print(f"Mavjudlari: {', '.join(PROJECTS.keys())}")
            sys.exit(1)

        if args.check:
            check_status(c, proj)
        else:
            deploy(c, proj)
    finally:
        c.close()


if __name__ == "__main__":
    main()
