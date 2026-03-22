#!/usr/bin/env python3
import os, shlex, sys
from pathlib import Path
import paramiko

def main():
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    p = os.environ.get("SSH_PASSWORD") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not p:
        sys.exit("SSH_PASSWORD kerak")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(os.environ.get("DEPLOY_HOST", "167.71.53.238"), username="root", password=p, timeout=45)
    root = "/opt/clinicmonitoring"
    cmd = f"cd {shlex.quote(root)} && git pull origin main && chmod +x deploy/remote_nginx_fix.sh && bash deploy/remote_nginx_fix.sh"
    _, stdout, stderr = c.exec_command(cmd, get_pty=True, timeout=120)
    for line in iter(stdout.readline, ""):
        if not line:
            break
        print(line, end="")
    print(stderr.read().decode(), file=sys.stderr)
    sys.exit(stdout.channel.recv_exit_status())

if __name__ == "__main__":
    main()
