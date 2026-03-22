#!/usr/bin/env python3
"""Eski nom: deploy_remote.py update ga yo'naltiradi."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

p = Path(__file__).resolve().parent / "deploy_remote.py"
raise SystemExit(subprocess.call([sys.executable, str(p), "update", *sys.argv[1:]]))
