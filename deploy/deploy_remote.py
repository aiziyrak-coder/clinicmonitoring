#!/usr/bin/env python3
"""
Masofadan deploy (paramiko). Skriptlar serverda bash orqali ishlaydi.

  pip install paramiko

Birinchi marta (apt, redis, clone, certbot):
  set SSH_PASSWORD=...
  python deploy/deploy_remote.py bootstrap

Keyingi yangilanishlar (git pull, migrate, frontend, nginx TLS, Daphne):
  python deploy/deploy_remote.py update

HL7 diagnostika (server .env da HL7_DEBUG=true, Daphne restart):
  python deploy/deploy_remote.py hl7-debug
  python deploy/deploy_remote.py hl7-debug-off
  python deploy/deploy_remote.py hl7-handshake-off   # hl7_real: MLLP salom o'ch (RST bo'lsa)
  python deploy/deploy_remote.py daphne-restart-logs # restart + HL7 journal (tez diagnostika)

Muhit:
  SSH_PASSWORD yoki argv[1] — parol
  DEPLOY_HOST (default 167.71.53.238), DEPLOY_USER (default root)
  CERTBOT_EMAIL (default admin@ziyrak.org)
  APP_ROOT (default /opt/clinicmonitoring)
  DEPLOY_GEMINI_KEY — bo'sh bo'lmasa, deploydan keyin serverda backend/.env ga
  GEMINI_API_KEY yoziladi va Daphne qayta ishga tushiriladi (rasm tahlili).
"""
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("paramiko kerak: pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.environ.get("DEPLOY_HOST", "167.71.53.238")
USER = os.environ.get("DEPLOY_USER", "root")
CERTBOT_EMAIL = os.environ.get("CERTBOT_EMAIL", "admin@ziyrak.org")
APP_ROOT_DEFAULT = os.environ.get("APP_ROOT", "/opt/clinicmonitoring")

SCRIPTS = {
    "bootstrap": "remote_deploy.sh",
    "update": "remote_full_update.sh",
    "hl7-debug": "remote_hl7_debug.sh",
    "hl7-debug-off": "remote_hl7_debug_off.sh",
    "hl7-handshake-off": "remote_hl7_handshake_device_off.sh",
    "daphne-restart-logs": "remote_daphne_restart_logs.sh",
}


def _configure_stdio() -> None:
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def _inject_gemini_and_restart(client: "paramiko.SSHClient") -> None:
    """Serverda GEMINI_API_KEY ni .env ga yozadi va Daphne ni qayta ishga tushiradi."""
    key = os.environ.get("DEPLOY_GEMINI_KEY", "").strip()
    if not key:
        return
    app_root = os.environ.get("APP_ROOT", APP_ROOT_DEFAULT)
    py = f"""import pathlib
p = pathlib.Path({app_root!r}) / "backend" / ".env"
key = {key!r}
if not p.is_file():
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("", encoding="utf-8")
t = p.read_text(encoding="utf-8")
lines = t.splitlines()
out = []
found = False
for line in lines:
    if line.startswith("GEMINI_API_KEY="):
        out.append("GEMINI_API_KEY=" + key)
        found = True
    else:
        out.append(line)
if not found:
    out.append("GEMINI_API_KEY=" + key)
p.write_text("\\n".join(out) + "\\n", encoding="utf-8")
print("GEMINI_API_KEY backend/.env ga yozildi")
"""
    stdin, stdout, stderr = client.exec_command("python3 -", timeout=120)
    stdin.write(py)
    stdin.close()
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out, end="")
    if err.strip():
        print(err, file=sys.stderr)
    if stdout.channel.recv_exit_status() != 0:
        print("GEMINI .env yozishda xato", file=sys.stderr)
        return
    stdin2, stdout2, stderr2 = client.exec_command(
        "systemctl restart clinicmonitoring-daphne && sleep 2 && systemctl is-active clinicmonitoring-daphne",
        timeout=60,
    )
    print(stdout2.read().decode(), end="")
    e2 = stderr2.read().decode()
    if e2.strip():
        print(e2, file=sys.stderr)


def main() -> None:
    _configure_stdio()
    args = [a for a in sys.argv[1:] if a]
    if args and args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    mode = "update"
    if args and args[0] in SCRIPTS:
        mode = args.pop(0)

    password = os.environ.get("SSH_PASSWORD")
    if not password and args:
        password = args[-1]
    if not password:
        print("SSH_PASSWORD muhit o'zgaruvchisi yoki parolni argument sifatida bering.", file=sys.stderr)
        print("  set SSH_PASSWORD=... && python deploy/deploy_remote.py update", file=sys.stderr)
        print("  python deploy/deploy_remote.py update YOUR_PASSWORD", file=sys.stderr)
        sys.exit(1)

    script_name = SCRIPTS[mode]
    script_path = Path(__file__).resolve().parent / script_name
    if not script_path.is_file():
        print(f"Skript topilmadi: {script_path}", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Ulanmoqda {USER}@{HOST} — {mode} ({script_name})...")
    client.connect(HOST, username=USER, password=password, timeout=60)

    remote_sh = f"/tmp/clinicmonitoring_{mode}.sh"
    sftp = client.open_sftp()
    sftp.put(str(script_path), remote_sh)
    sftp.chmod(remote_sh, 0o755)
    sftp.close()

    cmd = (
        f"export CERTBOT_EMAIL={shlex.quote(CERTBOT_EMAIL)}; "
        f"export APP_ROOT={shlex.quote(os.environ.get('APP_ROOT', APP_ROOT_DEFAULT))}; "
        f"bash {shlex.quote(remote_sh)}"
    )
    print("Ishga tushmoqda (bir necha daqiqa bo'lishi mumkin)...")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=3600)
    for line in iter(stdout.readline, ""):
        if line == "":
            break
        print(line, end="")
    err = stderr.read().decode()
    if err.strip():
        print(err, file=sys.stderr)
    code = stdout.channel.recv_exit_status()
    if code == 0:
        try:
            _inject_gemini_and_restart(client)
        except Exception as exc:
            print(f"GEMINI inject: {exc}", file=sys.stderr)
    client.close()
    if code != 0:
        print(f"Exit code: {code}", file=sys.stderr)
    sys.exit(code)


if __name__ == "__main__":
    main()
