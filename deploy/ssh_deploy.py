#!/usr/bin/env python3
"""Eski nom: deploy_remote.py bootstrap ga yo'naltiradi."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

p = Path(__file__).resolve().parent / "deploy_remote.py"
raise SystemExit(subprocess.call([sys.executable, str(p), "bootstrap", *sys.argv[1:]]))
