"""
HL7 MLLP (Minimal Lower Layer Protocol) TCP server — qurilmalar serverga ulanadi (odatda port 6006).
Ba'zi monitorlar MLLP (0x0B…0x1C0x0D) yubormasligi mumkin — MSH segmenti bo'yicha ham qabul qilinadi.
"""
from __future__ import annotations

import errno
import logging
import os
import socket
import threading
import time

logger = logging.getLogger(__name__)

HL7_THREAD: threading.Thread | None = None
HL7_LOCK = threading.Lock()

# API / connection-check uchun: TCP bor lekin HL7 yozuv yo'q muammosini aniqlash
HL7_DIAG_LOCK = threading.Lock()
HL7_DIAG: dict[str, object] = {
    "lastPayloadAtMs": None,
    "lastPayloadPeer": None,
    "lastPayloadTotalBytes": 0,
    "lastAckAttempted": False,
    "tcpSessionsWithHl7Payload": 0,
    "tcpSessionsWithoutHl7Payload": 0,
}


def get_hl7_diagnostic_summary() -> dict[str, object]:
    """Brauzer / API: server HL7 haqiqatan qabul qilyaptimi."""
    with HL7_DIAG_LOCK:
        return dict(HL7_DIAG)


def _record_hl7_session(peer_ip: str, raws: list[bytes], ack_attempted: bool) -> None:
    with HL7_DIAG_LOCK:
        if not raws:
            HL7_DIAG["tcpSessionsWithoutHl7Payload"] = (
                int(HL7_DIAG.get("tcpSessionsWithoutHl7Payload") or 0) + 1
            )
            return
        total = sum(len(r) for r in raws)
        now = int(time.time() * 1000)
        HL7_DIAG["lastPayloadAtMs"] = now
        HL7_DIAG["lastPayloadPeer"] = peer_ip
        HL7_DIAG["lastPayloadTotalBytes"] = total
        HL7_DIAG["lastAckAttempted"] = ack_attempted
        HL7_DIAG["tcpSessionsWithHl7Payload"] = (
            int(HL7_DIAG.get("tcpSessionsWithHl7Payload") or 0) + 1
        )


def _normalize_peer_ip(ip: str) -> str:
    """
    IPv4-mapped IPv6 (::ffff:192.168.0.1) ni bazadagi IPv4 bilan solishtirish uchun.
    """
    if ip.startswith("::ffff:") and "." in ip[7:]:
        return ip[7:]
    return ip


_MLLP_ENDS = (b"\x1c\x0d", b"\x1c\x0a")


def _extract_msh10_message_control_id(hl7_text: str) -> str:
    """MSH-10 (message control id) — ACK uchun."""
    for line in hl7_text.replace("\n", "\r").split("\r"):
        line = line.strip()
        if not line.startswith("MSH|"):
            continue
        parts = line.split("|")
        if len(parts) > 9:
            cid = parts[9].strip()
            if cid:
                return cid.split("^")[0].strip()
    return ""


def _send_mllp_ack_for_incoming(conn: socket.socket, incoming_raw: bytes) -> None:
    """
    HL7 qabul qiluvchi ilova ORU yuborgan qurilmaga MSA|AA ACK qaytarishi kerak.
    Ba'zi monitorlar javobsiz qolsa keyingi ma'lumot yubormaydi yoki TCP ni RST bilan yopadi.
    """
    if os.environ.get("HL7_SEND_ACK", "true").lower() not in ("1", "true", "yes", "on"):
        return
    try:
        text = incoming_raw.decode("utf-8", errors="replace")
    except Exception:
        return
    if "MSH|" not in text:
        return
    msg_id = _extract_msh10_message_control_id(text) or "UNKNOWN"
    dt = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    ack_body = (
        f"MSH|^~\\&|MediCentral|MediCentral|Monitor|_|{dt}||ACK^R01^ACK|{msg_id}|P|2.3\r"
        f"MSA|AA|{msg_id}|\r"
    )
    payload = b"\x0b" + ack_body.encode("utf-8") + b"\x1c\x0d"
    try:
        conn.sendall(payload)
        logger.info("HL7: MLLP ACK yuborildi (MSA|AA) msg_id=%s", msg_id)
    except OSError as exc:
        logger.info("HL7: ACK yuborib bo'lmadi: %s", exc)


def _peel_one_mllp_payload(buf: bytes) -> tuple[bytes | None, bytes]:
    """
    Birinchi to'liq MLLP ramkasini ajratadi: 0x0B … 0x1C 0x0D yoki … 0x1C 0x0A.
    To'liq bo'lmasa (None, buf) qaytariladi.
    """
    start = buf.find(b"\x0b")
    if start == -1:
        return None, buf
    sub = buf[start:]
    end_rel: int | None = None
    term_len = 2
    for term in _MLLP_ENDS:
        pos = sub.find(term)
        if pos != -1:
            end_rel = pos
            term_len = len(term)
            break
    if end_rel is None:
        return None, buf
    abs_end = start + end_rel
    payload = buf[start + 1 : abs_end]
    remaining = buf[abs_end + term_len :]
    return payload, remaining


def _recv_hl7_chunk(conn: socket.socket) -> bytes:
    """recv(); peer RST/FIN — xatolik emas, qolgan buffer qayta ishlanadi."""
    try:
        return conn.recv(8192)
    except (ConnectionResetError, BrokenPipeError) as exc:
        logger.info(
            "HL7: recv — peer ulanishni uzdi (%s); qolgan buffer qayta ishlanadi",
            exc,
        )
        return b""
    except OSError as exc:
        if exc.errno in (
            errno.ECONNRESET,
            errno.EPIPE,
            errno.ETIMEDOUT,
            10054,
            10053,
        ):  # WSAECONNRESET / WSAECONNABORTED (Windows)
            logger.info(
                "HL7: recv — socket yopildi (errno=%s); qolgan buffer qayta ishlanadi",
                exc.errno,
            )
            return b""
        raise


def _recv_all_hl7_payloads(conn: socket.socket, max_bytes: int = 1_048_576) -> list[bytes]:
    """
    Bir ulanishdan bitta yoki bir nechta HL7 xabarlarni olish.
    Ba'zi qurilmalar avval ACK/heartbeat, keyin ORU^R01 yuboradi — bitta recv bilan faqat
    birinchi ramka o'qilsa vitallar yo'qoladi.
    MLLP bo'lmasa, yopilishda MSH| dan boshlab butun buffer bitta xabar sifatida olinadi.
    Peer RST (Connection reset by peer) — recv xato emas; shu paytgacha kelgan baytlar saqlanadi.
    """
    buf = bytearray()
    out: list[bytes] = []
    while len(buf) < max_bytes:
        chunk = _recv_hl7_chunk(conn)
        if not chunk:
            break
        buf += chunk
        while True:
            msg, rest = _peel_one_mllp_payload(bytes(buf))
            if msg is None:
                buf[:] = rest
                break
            out.append(msg)
            buf[:] = bytearray(rest)

    tail = bytes(buf)
    if not tail:
        return out
    msh = tail.find(b"MSH|")
    if msh != -1:
        # MLLP boshlanmagan (yoki yopuvchi 0x1C0x0D yetib kelmagan) qoldiq
        lone = tail[msh:]
        if lone:
            out.append(lone)
    return out


def _configure_accepted_socket(conn: socket.socket) -> None:
    """Kechikishni kamaytirish va uzoq ulanish uchun TCP sozlamalari."""
    try:
        conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except OSError:
        pass
    try:
        conn.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    except OSError:
        pass


def _maybe_send_connect_handshake(conn: socket.socket) -> bool:
    """
    Ba'zi bedside monitorlar (jumladan OEM/K12) TCP ochgach serverdan birinchi MLLP javobini kutadi.
    Recv dan oldin yuboriladi — keyin qurilma ORU yuborishi mumkin.
    Muammo bo'lsa .env da HL7_SEND_CONNECT_HANDSHAKE=false qiling.
    """
    if os.environ.get("HL7_SEND_CONNECT_HANDSHAKE", "true").lower() not in (
        "1",
        "true",
        "yes",
        "on",
    ):
        return False
    dt = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    body = (
        f"MSH|^~\\&|MediCentral|_|_|_|{dt}||ACK^R01^ACK|CONNHS|P|2.3\r"
        f"MSA|AA|CONNHS|\r"
    )
    payload = b"\x0b" + body.encode("utf-8") + b"\x1c\x0d"
    try:
        conn.sendall(payload)
        logger.info("HL7: ulanish handshake (MLLP) yuborildi — keyin qurilma javobi kutilmoqda")
        return True
    except OSError as exc:
        logger.info("HL7: handshake yuborilmadi: %s", exc)
        return False


def _touch_device_online_on_connect(peer_ip: str) -> None:
    """TCP accept bo'lganda — HL7 tan o'qilishidan oldin qurilmani onlayn qilish."""
    from monitoring.device_integration import mark_device_online_only, resolve_hl7_device_by_peer_ip

    device = resolve_hl7_device_by_peer_ip(peer_ip)
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

        _configure_accepted_socket(conn)
        _maybe_send_connect_handshake(conn)

        raws = _recv_all_hl7_payloads(conn)
        if not raws:
            _record_hl7_session(peer_ip, [], False)
            logger.warning(
                "HL7: %s dan HL7 yozuv kelmadi. Agar logda «recv — peer ulanishni uzdi» bo'lsa, "
                "monitor TCP ni ochadi lekin ORU/OBX yubormaydi yoki serverdan javob kutadi (~20s) — "
                "qurilma HL7 chiqish rejimi va markaziy stansiya / «numerics» yuborishni tekshiring.",
                peer_ip,
            )
            return

        from django.db import close_old_connections

        ack_any = False
        for raw in raws:
            close_old_connections()
            try:
                _send_mllp_ack_for_incoming(conn, raw)
                ack_any = True
                try:
                    text = raw.decode("utf-8", errors="replace")
                except Exception:
                    text = raw.decode("latin-1", errors="replace")
                _process_hl7_text(text, raw, peer_ip, peer_raw)
            finally:
                close_old_connections()
        _record_hl7_session(peer_ip, raws, ack_any)
    except (ConnectionResetError, BrokenPipeError) as exc:
        logger.info("HL7: ulanish yopildi (peer) peer=%s: %s", peer_ip, exc)
    except OSError as exc:
        if exc.errno in (
            errno.ECONNRESET,
            errno.EPIPE,
            errno.ETIMEDOUT,
            10054,
            10053,
        ):
            logger.info("HL7: socket yopildi peer=%s errno=%s", peer_ip, exc.errno)
        else:
            logger.exception("HL7 ulanish OSError peer=%s", peer_ip)
    except Exception:
        logger.exception("HL7 ulanish xatolik peer=%s", peer_ip)
    finally:
        try:
            conn.close()
        except OSError:
            pass


def _process_hl7_text(text: str, raw: bytes, peer_ip: str, peer_raw: str) -> None:
    from monitoring.device_integration import (
        apply_vitals_payload,
        mark_device_online_only,
        resolve_hl7_device_by_peer_ip,
    )
    from monitoring.hl7_parser import hl7_segment_type_summary, parse_hl7_vitals_best

    device = resolve_hl7_device_by_peer_ip(peer_ip)
    if not device:
        logger.warning(
            "HL7: manzil mos kelmedi — ulanish manbasi: %s (xom: %s). "
            "Admin: MonitorDevice da ip_address/local_ip yoki hl7_peer_ip (NAT tashqi IP) ni tekshiring; "
            "yoki bitta HL7 qurilma uchun HL7_NAT_SINGLE_DEVICE_FALLBACK=true (standart).",
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
        if os.environ.get("HL7_LOG_RAW_PREVIEW", "").lower() in (
            "1",
            "true",
            "yes",
            "on",
        ):
            prev = text[: min(900, len(text))].replace("\r", "¶")
            logger.warning("HL7 diagn: xom matn (PHI bo'lishi mumkin): %s", prev)


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
