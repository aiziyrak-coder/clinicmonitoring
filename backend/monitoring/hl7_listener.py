"""
HL7 MLLP (Minimal Lower Layer Protocol) TCP server — qurilmalar serverga ulanadi (odatda port 6006).
Ba'zi monitorlar MLLP (0x0B…0x1C0x0D) yubormasligi mumkin — MSH segmenti bo'yicha ham qabul qilinadi.
"""
from __future__ import annotations

import logging
import os
import socket
import threading
import time

logger = logging.getLogger(__name__)

HL7_THREAD: threading.Thread | None = None
HL7_LOCK = threading.Lock()


def _normalize_peer_ip(ip: str) -> str:
    """
    IPv4-mapped IPv6 (::ffff:192.168.0.1) ni bazadagi IPv4 bilan solishtirish uchun.
    """
    if ip.startswith("::ffff:") and "." in ip[7:]:
        return ip[7:]
    return ip


def _recv_hl7_payload(conn: socket.socket, max_bytes: int = 1_048_576) -> bytes | None:
    """
    Avval MLLP ramkasi (0x0B … 0x1C 0x0D).
    Bo'lmasa, bufferda MSH| bo'lsa — ulanish yopilguncha yig'ilgan ma'lumotdan HL7 ajratiladi
    (ba'zi Creative Medical / boshqa firmwarelar).
    """
    buf = b""
    while len(buf) < max_bytes:
        chunk = conn.recv(8192)
        if not chunk:
            break
        buf += chunk
        start = buf.find(b"\x0b")
        if start != -1:
            end = buf.find(b"\x1c\x0d", start)
            if end != -1:
                return buf[start + 1 : end]

    if not buf:
        return None
    msh = buf.find(b"MSH|")
    if msh == -1:
        return None
    return buf[msh:]


def _touch_device_online_on_connect(peer_ip: str) -> None:
    """TCP accept bo'lganda — HL7 tan o'qilishidan oldin qurilmani onlayn qilish."""
    from django.db.models import Q

    from monitoring.device_integration import mark_device_online_only
    from monitoring.models import MonitorDevice

    device = (
        MonitorDevice.objects.filter(
            Q(ip_address=peer_ip)
            | Q(local_ip=peer_ip)
            | Q(hl7_peer_ip=peer_ip)
        )
        .filter(hl7_enabled=True)
        .first()
    )
    if device:
        mark_device_online_only(device)
        logger.info("HL7: TCP ulanish qabul qilindi — onlayn: %s peer=%s", device.id, peer_ip)


def _handle_connection(conn: socket.socket, addr: tuple[str, int]) -> None:
    peer_raw = addr[0]
    peer_ip = _normalize_peer_ip(peer_raw)
    try:
        from django.db import close_old_connections

        close_old_connections()
        try:
            _touch_device_online_on_connect(peer_ip)
        finally:
            close_old_connections()

        raw = _recv_hl7_payload(conn)
        if not raw:
            logger.warning(
                "HL7: %s dan ma'lumot o'qilmadi (MLLP/MSH yo'q yoki bo'sh ulanish).",
                peer_ip,
            )
            return
        try:
            text = raw.decode("utf-8", errors="replace")
        except Exception:
            text = raw.decode("latin-1", errors="replace")

        from django.db import close_old_connections

        close_old_connections()
        try:
            _process_hl7_text(text, raw, peer_ip, peer_raw)
        finally:
            close_old_connections()
    except Exception:
        logger.exception("HL7 ulanish xatolik peer=%s", peer_ip)
    finally:
        try:
            conn.close()
        except OSError:
            pass


def _process_hl7_text(text: str, raw: bytes, peer_ip: str, peer_raw: str) -> None:
    from django.db.models import Q

    from monitoring.device_integration import apply_vitals_payload, mark_device_online_only
    from monitoring.hl7_parser import hl7_segment_type_summary, parse_hl7_vitals_best
    from monitoring.models import MonitorDevice

    device = (
        MonitorDevice.objects.filter(
            Q(ip_address=peer_ip)
            | Q(local_ip=peer_ip)
            | Q(hl7_peer_ip=peer_ip)
        )
        .filter(hl7_enabled=True)
        .first()
    )
    if not device:
        logger.warning(
            "HL7: manzil mos kelmedi — ulanish manbasi: %s (xom: %s). "
            "MediCentralda qurilma 'ipAddress' yoki 'localIp' shu manzilga teng bo'lishi kerak; "
            "NAT yoki boshqa IP bo'lsa, sozlamada yangilang.",
            peer_ip,
            peer_raw,
        )
        return

    vitals = parse_hl7_vitals_best(raw)
    if vitals:
        apply_vitals_payload(device, vitals, mark_online=True)
        logger.info(
            "HL7: vitallar qabul qilindi — qurilma=%s peer=%s",
            device.id,
            peer_ip,
        )
    else:
        mark_device_online_only(device)
        logger.warning(
            "HL7: vitallar ajratilmadi (OBX/kengaytirilgan parse bo'sh), faqat onlayn — "
            "qurilma=%s peer=%s segmentlar=[%s] uzunlik=%s",
            device.id,
            peer_ip,
            hl7_segment_type_summary(text),
            len(text),
        )


def _serve_loop(host: str, port: int) -> None:
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind((host, port))
    except OSError as exc:
        logger.error("HL7 tinglovchini bog'lash mumkin emas %s:%s — %s", host, port, exc)
        return
    srv.listen(32)
    logger.info("HL7 MLLP tinglayapti: %s:%s", host, port)
    while True:
        try:
            conn, addr = srv.accept()
            conn.settimeout(120.0)
            t = threading.Thread(
                target=_handle_connection,
                args=(conn, addr),
                daemon=True,
                name=f"hl7-{addr[0]}",
            )
            t.start()
        except OSError:
            break


def is_hl7_listener_alive() -> bool:
    """HL7 MLLP daemon thread ishlayaptimi."""
    with HL7_LOCK:
        return HL7_THREAD is not None and HL7_THREAD.is_alive()


def get_hl7_listen_config() -> tuple[str, int, bool]:
    """(host, port, enabled) — muhit o'zgaruvchilari."""
    en = os.environ.get("HL7_LISTEN_ENABLED", "true").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    host = os.environ.get("HL7_LISTEN_HOST", "0.0.0.0")
    port = int(os.environ.get("HL7_LISTEN_PORT", "6006"))
    return host, port, en


def probe_hl7_tcp_listening() -> bool:
    """
    Serverda HL7 port lokal ravishda qabul qilyaptimi (127.0.0.1).
    Qurilma ulanishidan oldin backend tinglovchisi ishga tushganini tasdiqlash uchun.
    """
    _, port, enabled = get_hl7_listen_config()
    if not enabled:
        return False
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        result = s.connect_ex(("127.0.0.1", port))
        s.close()
        return result == 0
    except OSError:
        return False


def start_hl7_listener_thread() -> None:
    global HL7_THREAD
    host, port, en = get_hl7_listen_config()
    if not en:
        logger.info("HL7 tinglovchi o'chirilgan (HL7_LISTEN_ENABLED).")
        return
    with HL7_LOCK:
        if HL7_THREAD and HL7_THREAD.is_alive():
            return
        HL7_THREAD = threading.Thread(
            target=_serve_loop,
            args=(host, port),
            daemon=True,
            name="hl7-mllp",
        )
        HL7_THREAD.start()
        time.sleep(0.05)
