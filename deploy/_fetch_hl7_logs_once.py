"""One-off: restart Daphne on DEPLOY_HOST, print hl7_real handshake, dump journal."""
import os
import sys

try:
    import paramiko
except ImportError:
    print("pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.environ.get("DEPLOY_HOST", "167.71.53.238")
PW = os.environ.get("SSH_PASSWORD", "")
if not PW:
    print("SSH_PASSWORD kerak", file=sys.stderr)
    sys.exit(1)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PW, timeout=60)

def run(cmd: str) -> str:
    i, o, e = c.exec_command(cmd, timeout=180)
    err = e.read().decode("utf-8", errors="replace")
    out = o.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err, end="", file=sys.stderr)
    return out

print("=== restart ===")
print(run("systemctl restart clinicmonitoring-daphne && sleep 5 && systemctl is-active clinicmonitoring-daphne"))

print("=== hl7_real handshake in DB ===")
print(
    run(
        "cd /opt/clinicmonitoring/backend && . .venv/bin/activate && "
        'python manage.py shell -c "from monitoring.models import MonitorDevice; '
        "d=MonitorDevice.objects.get(pk='hl7_real'); print(repr(d.hl7_connect_handshake))\""
    )
)

print("=== journalctl last 250 ===")
print(run("journalctl -u clinicmonitoring-daphne -n 250 --no-pager"))
c.close()
