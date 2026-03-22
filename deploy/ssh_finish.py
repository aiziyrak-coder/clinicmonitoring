#!/usr/bin/env python3
"""remote_finish.sh ni serverda ishga tushirish (npm/nginx qayta)."""
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("pip install paramiko")
    sys.exit(1)

HOST = os.environ.get("DEPLOY_HOST", "167.71.53.238")
USER = os.environ.get("DEPLOY_USER", "root")
CERTBOT_EMAIL = os.environ.get("CERTBOT_EMAIL", "admin@ziyrak.org")


def main() -> None:
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    password = os.environ.get("SSH_PASSWORD") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not password:
        print("SSH_PASSWORD yoki: python ssh_finish.py <parol>")
        sys.exit(1)

    script_path = Path(__file__).resolve().parent / "remote_finish.sh"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=password, timeout=45)

    sftp = client.open_sftp()
    remote_sh = "/tmp/clinicmonitoring_remote_finish.sh"
    sftp.put(str(script_path), remote_sh)
    sftp.chmod(remote_sh, 0o755)
    sftp.close()

    cmd = f"export CERTBOT_EMAIL={shlex.quote(CERTBOT_EMAIL)}; bash {shlex.quote(remote_sh)}"
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
    sys.exit(code)


if __name__ == "__main__":
    main()
