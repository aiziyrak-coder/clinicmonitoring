#!/usr/bin/env python3
"""
Masofadan to'liq deploy (paramiko).
Parol: muhit o'zgaruvchisi SSH_PASSWORD (tavsiya) yoki argv[1].

  set SSH_PASSWORD=...
  python deploy/ssh_deploy.py

Yoki: python deploy/ssh_deploy.py <parol>
"""
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("paramiko kerak: pip install paramiko")
    sys.exit(1)

HOST = os.environ.get("DEPLOY_HOST", "167.71.53.238")
USER = os.environ.get("DEPLOY_USER", "root")
CERTBOT_EMAIL = os.environ.get("CERTBOT_EMAIL", "admin@ziyrak.org")


def main() -> None:
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    password = os.environ.get("SSH_PASSWORD") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not password:
        print("SSH_PASSWORD muhit o'zgaruvchisi yoki: python ssh_deploy.py <parol>")
        sys.exit(1)

    script_path = Path(__file__).resolve().parent / "remote_deploy.sh"
    if not script_path.is_file():
        print(f"remote_deploy.sh topilmadi: {script_path}")
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Ulanmoqda {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=password, timeout=45)

    sftp = client.open_sftp()
    remote_sh = "/tmp/clinicmonitoring_remote_deploy.sh"
    sftp.put(str(script_path), remote_sh)
    sftp.chmod(remote_sh, 0o755)
    sftp.close()

    cmd = f"export CERTBOT_EMAIL={shlex.quote(CERTBOT_EMAIL)}; bash {shlex.quote(remote_sh)}"

    print("Remote deploy ishga tushmoqda (bir necha daqiqa)...")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=3600)
    for line in iter(stdout.readline, ""):
        if line == "":
            break
        print(line, end="")
    err = stderr.read().decode()
    if err.strip():
        print(err, file=sys.stderr)
    code = stdout.channel.recv_exit_status()
    client.close()
    if code != 0:
        print(f"Exit code: {code}", file=sys.stderr)
    sys.exit(code)


if __name__ == "__main__":
    main()
