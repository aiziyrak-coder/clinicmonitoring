#!/usr/bin/env python3
"""Upload Daphne + nginx configs and reload services (shared server: Daphne on 8012)."""
import os
import sys

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "167.71.53.238")
ROOT = os.path.dirname(os.path.abspath(__file__))
FILES = [
    (os.path.join(ROOT, "clinicmonitoring-daphne.service"), "/etc/systemd/system/clinicmonitoring-daphne.service"),
    (os.path.join(ROOT, "nginx-clinicmonitoring.conf"), "/etc/nginx/sites-available/clinicmonitoring"),
]


def main() -> None:
    password = os.environ.get("SSH_PASSWORD") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not password:
        print("Set SSH_PASSWORD or pass password as argv[1]", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=password, timeout=45)
    sftp = client.open_sftp()
    try:
        for local, remote in FILES:
            sftp.put(local, remote)
            print(f"Uploaded {local} -> {remote}")
    finally:
        sftp.close()

    script = """
set -e
chmod 644 /etc/systemd/system/clinicmonitoring-daphne.service
chmod 644 /etc/nginx/sites-available/clinicmonitoring
systemctl daemon-reload
systemctl enable clinicmonitoring-daphne
systemctl restart clinicmonitoring-daphne
sleep 2
systemctl is-active clinicmonitoring-daphne
ss -tlnp | grep 8012 || true
nginx -t
systemctl reload nginx
echo "--- health ---"
curl -sS "https://clinicmonitoring.ziyrak.org/api/health/"
echo
"""
    stdin, stdout, stderr = client.exec_command("bash -s", timeout=120)
    stdin.write(script)
    stdin.close()
    out = stdout.read().decode()
    err = stderr.read().decode()
    client.close()
    print(out)
    if err:
        print(err, file=sys.stderr)
    if stdout.channel.recv_exit_status() != 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
