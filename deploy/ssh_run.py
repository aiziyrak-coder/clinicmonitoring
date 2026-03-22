#!/usr/bin/env python3
import os, sys
import paramiko
p = os.environ.get("SSH_PASSWORD") or sys.argv[1]
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("167.71.53.238", username="root", password=p, timeout=30)
cmd = sys.argv[2] if len(sys.argv) > 2 else "grep DJANGO_ALLOWED_HOSTS /opt/clinicmonitoring/backend/.env; curl -sS -o /dev/null -w '%{http_code}' -H 'Host: clinicmonitoring.ziyrak.org' http://127.0.0.1:8012/api/health/"
_, out, err = c.exec_command(cmd, timeout=30)
print(out.read().decode())
print(err.read().decode(), file=sys.stderr)
c.close()
