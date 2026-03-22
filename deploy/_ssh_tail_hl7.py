"""Vaqtincha: journalctl dan HL7 qatorlari (SSH)."""
import os
import sys

import paramiko

def main() -> None:
    pw = os.environ.get("SSH_PASSWORD")
    if not pw:
        print("SSH_PASSWORD kerak", file=sys.stderr)
        sys.exit(1)
    host = os.environ.get("DEPLOY_HOST", "167.71.53.238")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password=pw, timeout=60)
    cmd = "journalctl -u clinicmonitoring-daphne -n 300 --no-pager"
    _, stdout, _ = c.exec_command(cmd, timeout=120)
    text = stdout.read().decode("utf-8", errors="replace")
    c.close()
    for line in text.splitlines():
        if "HL7" in line or "188.113.206" in line or "peer=" in line.lower():
            print(line)


if __name__ == "__main__":
    main()
