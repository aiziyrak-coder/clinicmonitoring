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
  python deploy/deploy_remote.py k12-setup           # faqat K12 qurilma + bemor + Daphne restart
  python deploy/deploy_remote.py reset-fresh         # baza tozalash + K12 noldan + Daphne restart
  python deploy/deploy_remote.py hl7-post-setup      # HL7_BRIDGE_TOKEN + /api/hl7/ test (deploydan keyin)

Muhit:
  SSH_PASSWORD yoki oxirgi argv — parol (ixtiyoriy, agar kalit bo'lsa)
  SSH_PRIVATE_KEY_PATH — maxsus kalit fayli (bo'sh bo'lsa: ~/.ssh/id_ed25519, id_rsa, id_ecdsa)
  SSH_KEY_PASSPHRASE — shifrlangan kalit uchun
  DEPLOY_HOST (default 167.71.53.238), DEPLOY_USER (default root)
  CERTBOT_EMAIL (default admin@ziyrak.org)
  APP_ROOT (default /opt/clinicmonitoring)
  DEPLOY_GEMINI_KEY — bo'sh bo'lmasa, deploydan keyin serverda backend/.env ga
  GEMINI_API_KEY yoziladi va Daphne qayta ishga tushiriladi (rasm tahlili).

Faqat GEMINI (tez):
  set DEPLOY_GEMINI_KEY=... && set SSH_PASSWORD=...
  python deploy/deploy_remote.py gemini-inject
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
    "k12-setup": "remote_k12_setup_monitor.sh",
    "reset-fresh": "remote_reset_monitoring_fresh.sh",
    "hl7-post-setup": "remote_hl7_post_setup.sh",
}


def _key_passphrase() -> str | None:
    p = os.environ.get("SSH_KEY_PASSPHRASE", "").strip()
    return p if p else None


def _load_ssh_private_key() -> "paramiko.PKey | None":
    """
    SSH_PRIVATE_KEY_PATH yoki ~/.ssh/id_ed25519, id_rsa, id_ecdsa (birinchi ochilgan).
    """
    paths: list[Path] = []
    env_p = os.environ.get("SSH_PRIVATE_KEY_PATH", "").strip()
    if env_p:
        paths.append(Path(env_p).expanduser())
    ssh_dir = Path.home() / ".ssh"
    for name in ("id_ed25519", "id_rsa", "id_ecdsa"):
        paths.append(ssh_dir / name)
    seen: set[str] = set()
    pp = _key_passphrase()
    for path in paths:
        if not path.is_file():
            continue
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        for Loader in (
            paramiko.Ed25519Key,
            paramiko.RSAKey,
            paramiko.ECDSAKey,
        ):
            try:
                return Loader.from_private_key_file(str(path), password=pp)
            except Exception:
                continue
    return None


def _connect_ssh(
    client: "paramiko.SSHClient",
    *,
    password: str | None,
    pkey: "paramiko.PKey | None",
) -> None:
    kw: dict = {"hostname": HOST, "username": USER, "timeout": 60}
    if pkey is not None:
        kw["pkey"] = pkey
    if password:
        kw["password"] = password
    if pkey is None and not password:
        print(
            "SSH: parol (SSH_PASSWORD) yoki SSH kalit kerak.\n"
            "  Parol: set SSH_PASSWORD=... yoki python deploy/deploy_remote.py update PAROL\n"
            "  Kalit: serverda ~/.ssh/authorized_keys ga publik kalitingizni qo'shing; "
            "lokal ~/.ssh/id_ed25519 yoki id_rsa ishlatiladi (yoki SSH_PRIVATE_KEY_PATH=...).",
            file=sys.stderr,
        )
        sys.exit(1)
    client.connect(**kw)


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

    gemini_only = False
    if args and args[0] == "gemini-inject":
        gemini_only = True
        args.pop(0)

    mode = "update"
    if args and args[0] in SCRIPTS:
        mode = args.pop(0)

    password = os.environ.get("SSH_PASSWORD")
    if not password and args:
        password = args[-1]
    deploy_pkey = _load_ssh_private_key()
    if not password and deploy_pkey is None:
        print("SSH_PASSWORD muhit o'zgaruvchisi yoki parolni argument sifatida bering.", file=sys.stderr)
        print("  set SSH_PASSWORD=... && python deploy/deploy_remote.py update", file=sys.stderr)
        print("  python deploy/deploy_remote.py update YOUR_PASSWORD", file=sys.stderr)
        print("  Yoki SSH kalit: ~/.ssh/id_ed25519 (serverda authorized_keys).", file=sys.stderr)
        sys.exit(1)

    if gemini_only:
        key = os.environ.get("DEPLOY_GEMINI_KEY", "").strip()
        if not key:
            print("DEPLOY_GEMINI_KEY muhit o'zgaruvchisi kerak (kalitni repoga qo'ymang).", file=sys.stderr)
            sys.exit(1)
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        print(f"Ulanmoqda {USER}@{HOST} — gemini-inject (backend/.env + Daphne restart)...")
        _connect_ssh(client, password=password, pkey=deploy_pkey)
        try:
            _inject_gemini_and_restart(client)
        except Exception as exc:
            print(f"GEMINI inject: {exc}", file=sys.stderr)
            client.close()
            sys.exit(1)
        client.close()
        sys.exit(0)

    script_name = SCRIPTS[mode]
    script_path = Path(__file__).resolve().parent / script_name
    if not script_path.is_file():
        print(f"Skript topilmadi: {script_path}", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Ulanmoqda {USER}@{HOST} — {mode} ({script_name})...")
    _connect_ssh(client, password=password, pkey=deploy_pkey)

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
