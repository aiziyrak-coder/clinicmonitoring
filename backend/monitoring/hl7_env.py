"""
HL7 diagnostika muhiti.

HL7_DEBUG=true — bitta bayroq bilan xom TCP/MSH loglari (1-bosqich).
Alohida: HL7_LOG_RAW_TCP_RECV, HL7_LOG_RAW_PREVIEW, HL7_LOG_FIRST_RECV_HEX.
"""
from __future__ import annotations

import os

_TRUTHY = frozenset({"1", "true", "yes", "on"})


def _env_true(key: str) -> bool:
    return os.environ.get(key, "").strip().lower() in _TRUTHY


def hl7_debug_all() -> bool:
    """Barcha HL7 xom loglar (K12 / tarmoq diagnostikasi)."""
    return _env_true("HL7_DEBUG")


def want_log_raw_tcp_recv() -> bool:
    return hl7_debug_all() or _env_true("HL7_LOG_RAW_TCP_RECV")


def want_log_first_recv_hex() -> bool:
    return hl7_debug_all() or _env_true("HL7_LOG_FIRST_RECV_HEX")


def want_log_raw_preview() -> bool:
    return hl7_debug_all() or _env_true("HL7_LOG_RAW_PREVIEW")
