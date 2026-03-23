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
    "lastTcpRawBytesHex": None,
    "lastTcpRawPeer": None,
    "bindError": None,
    "lastEmptySessionTcpBytes": None,
    "lastEmptySessionPeer": None,
}


def get_hl7_diagnostic_summary() -> dict[str, object]:
    """Brauzer / API: server HL7 haqiqatan qabul qilyaptimi."""
    with HL7_DIAG_LOCK:
        return dict(HL7_DIAG)


def _record_hl7_session(peer_ip: str, raws: list[bytes], ack_attempted: bool) -> None:
    now = int(time.time() * 1000)
    with HL7_DIAG_LOCK:
        if not raws:
            HL7_DIAG["tcpSessionsWithoutHl7Payload"] = (
                int(HL7_DIAG.get("tcpSessionsWithoutHl7Payload") or 0) + 1
            )
            return
        total = sum(len(r) for r in raws)
        HL7_DIAG["lastPayloadAtMs"] = now
        HL7_DIAG["lastPayloadPeer"] = peer_ip
        HL7_DIAG["lastPayloadTotalBytes"] = total
        HL7_DIAG["lastAckAttempted"] = ack_attempted
        HL7_DIAG["tcpSessionsWithHl7Payload"] = (
            int(HL7_DIAG.get("tcpSessionsWithHl7Payload") or 0) + 1
        )

    from django.db import close_old_connections

    from monitoring.device_integration import resolve_hl7_device_by_peer_ip
    from monitoring.models import MonitorDevice

    close_old_connections()
    try:
        dev = resolve_hl7_device_by_peer_ip(peer_ip, allow_nat_loopback=True)
        if dev:
            MonitorDevice.objects.filter(pk=dev.pk).update(last_hl7_rx_at_ms=now)
    finally:
        close_old_connections()


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
    from monitoring.hl7_parser import decode_hl7_text_best, hl7_raw_contains_msh_segment

    if not hl7_raw_contains_msh_segment(incoming_raw):
        return
    text = decode_hl7_text_best(incoming_raw)
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


# UTF-16 HL7 (ba'zi OEM monitorlar)
_MSH_UTF16_LE = b"M\x00S\x00H\x00|\x00"
_MSH_UTF16_BE = b"\x00\x4d\x00\x53\x00\x48\x00\x7c"


def _find_msh_in_buffer(buf: bytes) -> int:
    """MSH segment boshlanishi — UTF-8 yoki UTF-16 LE/BE."""
    for needle in (b"MSH|", _MSH_UTF16_LE, _MSH_UTF16_BE):
        i = buf.find(needle)
        if i != -1:
            return i
    return -1


def _apply_connection_recv_timeout(conn: socket.socket) -> None:
    """0 yoki bo'sh = cheksiz kutish (birinchi ORU kechikishi mumkin)."""
    raw = os.environ.get("HL7_RECV_TIMEOUT_SEC", "0").strip()
    if not raw or raw == "0":
        conn.settimeout(None)
        return
    try:
        conn.settimeout(float(raw))
    except ValueError:
        conn.settimeout(None)


def _env_float_ms(key: str, default: float) -> float:
    """Muhit: millisekund (masalan 300) yoki bo'sh = default."""
    raw = os.environ.get(key, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _recv_device_first_chunk_before_handshake(conn: socket.socket, peer_ip: str) -> bytes:
    """
    Ba'zi monitorlar (jumladan K12) TCP ochilishi bilan darhol ORU yuboradi; serverdan
    avval MLLP salom yuborilsa, ba'zi firmware ulanishni yopadi yoki 0 bayt qoldiradi.
    Shu sababdan salomdan oldin qisqa kutish bilan birinchi paketni o'qimiz.
    """
    wait_ms = _env_float_ms("HL7_RECV_BEFORE_HANDSHAKE_MS", 300.0)
    if wait_ms <= 0:
        return b""
    chunk = b""
    try:
        conn.settimeout(wait_ms / 1000.0)
        chunk = conn.recv(65536)
    except socket.timeout:
        chunk = b""
    except (ConnectionResetError, BrokenPipeError):
        chunk = b""
    except OSError as exc:
        if exc.errno in (
            errno.ECONNRESET,
            errno.EPIPE,
            errno.ETIMEDOUT,
            10054,
            10053,
        ):
            chunk = b""
        else:
            raise
    finally:
        _apply_connection_recv_timeout(conn)
    if chunk:
        from monitoring.hl7_env import want_log_first_recv_hex

        if want_log_first_recv_hex():
            prev = chunk[:160]
            logger.info(
                "HL7: salomdan oldin TCP peer=%s len=%s hex=%s",
                peer_ip,
                len(chunk),
                prev.hex(),
            )
        else:
            logger.info(
                "HL7: salomdan oldin ma'lumot keldi peer=%s len=%s (salom o'tkaziladi)",
                peer_ip,
                len(chunk),
            )
    return chunk


def _recv_hl7_chunk(conn: socket.socket) -> bytes:
    """recv(); peer RST/FIN — xatolik emas, qolgan buffer qayta ishlanadi."""
    try:
        return conn.recv(8192)
    except TimeoutError:
        logger.info("HL7: recv — vaqt tugadi (HL7_RECV_TIMEOUT_SEC); qolgan buffer qayta ishlanadi")
        return b""
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


def _maybe_log_tcp_raw_diagnostic(peer_ip: str, tail: bytes) -> None:
    """MSH topilmasa — xom baytlarni (PHI!) faqat ixtiyoriy log."""
    from monitoring.hl7_env import want_log_raw_tcp_recv

    if not want_log_raw_tcp_recv():
        return
    if not tail:
        return
    preview = tail[:96]
    with HL7_DIAG_LOCK:
        HL7_DIAG["lastTcpRawPeer"] = peer_ip
        HL7_DIAG["lastTcpRawBytesHex"] = preview.hex()
    logger.warning(
        "HL7 diag: MSH yo'q — peer=%s len=%s hex=%s",
        peer_ip,
        len(tail),
        preview.hex(),
    )


def _recv_all_hl7_payloads(
    conn: socket.socket,
    peer_ip: str,
    max_bytes: int = 1_048_576,
    *,
    initial: bytes = b"",
) -> tuple[list[bytes], int]:
    """
    Bir ulanishdan bitta yoki bir nechta HL7 xabarlarni olish.
    Ba'zi qurilmalar avval ACK/heartbeat, keyin ORU^R01 yuboradi — bitta recv bilan faqat
    birinchi ramka o'qilsa vitallar yo'qoladi.
    MLLP bo'lmasa, yopilishda MSH| dan boshlab butun buffer bitta xabar sifatida olinadi.
    Peer RST (Connection reset by peer) — recv xato emas; shu paytgacha kelgan baytlar saqlanadi.
    `initial` — salomdan oldin olingan TCP qismi (qurilma birinchi yuborgan ma'lumot).
    """
    buf = bytearray(initial)
    out: list[bytes] = []
    first_chunk_logged = bool(initial)
    total_recv_bytes = len(initial)
    while len(buf) < max_bytes:
        chunk = _recv_hl7_chunk(conn)
        if not chunk:
            break
        total_recv_bytes += len(chunk)
        if not first_chunk_logged:
            first_chunk_logged = True
            from monitoring.hl7_env import want_log_first_recv_hex

            if want_log_first_recv_hex():
                prev = chunk[:160]
                logger.info(
                    "HL7: birinchi TCP recv peer=%s len=%s hex=%s",
                    peer_ip,
                    len(chunk),
                    prev.hex(),
                )
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
        return out, total_recv_bytes
    msh = _find_msh_in_buffer(tail)
    if msh != -1:
        # MLLP boshlanmagan (yoki yopuvchi 0x1C0x0D yetib kelmagan) qoldiq
        lone = tail[msh:]
        if lone:
            out.append(lone)
    else:
        _maybe_log_tcp_raw_diagnostic(peer_ip, tail)
    return out, total_recv_bytes


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


def _should_send_connect_handshake(peer_ip: str) -> bool:
    """Qurilma `hl7_connect_handshake` bilan muhit ustidan chiqadi (None = muhit)."""
    from monitoring.device_integration import resolve_hl7_device_by_peer_ip

    dev = resolve_hl7_device_by_peer_ip(peer_ip, allow_nat_loopback=False)
    if dev is not None and dev.hl7_connect_handshake is not None:
        return bool(dev.hl7_connect_handshake)
    return os.environ.get("HL7_SEND_CONNECT_HANDSHAKE", "false").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _maybe_send_connect_handshake(conn: socket.socket, peer_ip: str) -> bool:
    """
    Ba'zi bedside monitorlar (jumladan OEM/K12) TCP ochgach serverdan birinchi MLLP javobini kutadi.
    Recv dan oldin yuboriladi — keyin qurilma ORU yuborishi mumkin.
    Qurilma ro'yxatida «HL7 salom» (hl7ConnectHandshake) yoki muhit HL7_SEND_CONNECT_HANDSHAKE.
    """
    if not _should_send_connect_handshake(peer_ip):
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


def _send_oru_query_to_device(conn: socket.socket, peer_ip: str) -> bool:
    """
    K12 va ba'zi monitorlar faqat ORU so'roviga javob beradi.
    Bu funksiya ORU^R01 so'rovini yuboradi.
    """
    dt = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    # ORU so'rovi (query) - bu ba'zi monitorlarni javob berishga majburlaydi
    body = (
        f"MSH|^~\\&|MediCentral|MediCentral|Monitor|Monitor|{dt}||QRY^R01^QRY|QRY001|P|2.3\r"
        f"QRD|{dt}|R|I|QRY001|||RD|001|OTH|||T|1\r"
    )
    payload = b"\x0b" + body.encode("utf-8") + b"\x1c\x0d"
    try:
        conn.sendall(payload)
        logger.info("HL7: ORU so'rovi yuborildi peer=%s", peer_ip)
        return True
    except OSError as exc:
        logger.info("HL7: ORU so'rovi yuborilmadi: %s", exc)
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
    logger.info("=" * 60)
    logger.info("HL7: YANGI TCP ulanish qabul qilindi peer=%s (raw=%s)", peer_ip, peer_raw)
    
    # Qurilma sozlamalarini tekshirish
    from monitoring.device_integration import resolve_hl7_device_by_peer_ip
    dev = resolve_hl7_device_by_peer_ip(peer_ip, allow_nat_loopback=True)
    if dev:
        logger.info("HL7: Qurilma topildi: %s, handshake=%s", dev.id, dev.hl7_connect_handshake)
    else:
        logger.warning("HL7: Qurilma topilmadi peer=%s", peer_ip)
    
    try:
        from django.db import close_old_connections

        close_old_connections()
        try:
            _touch_device_online_on_connect(peer_ip)
        finally:
            close_old_connections()

        _configure_accepted_socket(conn)
        
        # K12 uchun maxsus algoritm
        logger.info("HL7: K12/maxsus qurilma algoritmi ishga tushmoqda...")
        
        # 1. Salomdan oldin ma'lumot kelishini kutish (qurilma birinchi yuboradigan bo'lsa)
        logger.info("HL7: Salomdan oldin ma'lumot kutilmoqda (300ms)...")
        pre_handshake_data = _recv_device_first_chunk_before_handshake(conn, peer_ip)
        
        if pre_handshake_data:
            logger.info("HL7: Qurilma salomdan OLDIN ma'lumot yubordi! len=%s", len(pre_handshake_data))
        else:
            # 2. Qurilma ma'lumot yubormagan - so'rov yuboramiz
            logger.info("HL7: Qurilma javob bermadi, so'rovlar yuborilmoqda...")
            
            # 2a. Handshake (agar sozlangan bo'lsa)
            handshake_sent = _maybe_send_connect_handshake(conn, peer_ip)
            if handshake_sent:
                logger.info("HL7: MLLP handshake yuborildi")
                time.sleep(0.1)  # Handshake javobini kutish
                
                # Handshake javobini tekshirish
                try:
                    conn.settimeout(0.5)
                    hs_response = conn.recv(1024)
                    if hs_response:
                        logger.info("HL7: Handshake javobi qabul qilindi: %s bytes", len(hs_response))
                        pre_handshake_data = hs_response
                except socket.timeout:
                    logger.info("HL7: Handshake javobi kelmadi")
                except Exception as e:
                    logger.info("HL7: Handshake qabulda xato: %s", e)
            
            # 2b. ORU so'rovi (K12 ni javob berishga majburlash)
            if not pre_handshake_data:
                logger.info("HL7: ORU so'rovi yuborilmoqda...")
                _send_oru_query_to_device(conn, peer_ip)
                time.sleep(0.2)  # ORU javobini kutish
                
                try:
                    conn.settimeout(1.0)
                    oru_response = conn.recv(4096)
                    if oru_response:
                        logger.info("HL7: ORU javobi qabul qilindi: %s bytes", len(oru_response))
                        pre_handshake_data = oru_response
                except socket.timeout:
                    logger.info("HL7: ORU javobi kelmadi")
                except Exception as e:
                    logger.info("HL7: ORU qabulda xato: %s", e)
        
        # 3. Qolgan ma'lumotlarni qabul qilish
        logger.info("HL7: Qolgan ma'lumotlar qabul qilinmoqda...")
        raws, total_tcp_in = _recv_all_hl7_payloads(
            conn, peer_ip, initial=pre_handshake_data
        )
        
        logger.info("HL7: Sessiya yakunlandi. Payloads=%s, Jami bytes=%s", 
                    len(raws), total_tcp_in)
        
        if not raws:
            from monitoring.device_integration import is_loopback_peer_ip

            if is_loopback_peer_ip(peer_ip):
                logger.debug("HL7: Loopback bo'sh sessiya")
                return
                
            _record_hl7_session(peer_ip, [], False)
            with HL7_DIAG_LOCK:
                HL7_DIAG["lastEmptySessionTcpBytes"] = total_tcp_in
                HL7_DIAG["lastEmptySessionPeer"] = peer_ip
                
            if total_tcp_in == 0:
                logger.error(
                    "=" * 60 + "\n"
                    "HL7 MUAMMO: %s — TCP ulanish bo'ldi, lekin 0 bayt!\n"
                    "Sabablar:\n"
                    "1. Qurilma HL7/MLLP yo'q (faqat TCP)\n"
                    "2. Handshake muammosi (hl7_connect_handshake ni o'zgartiring)\n"
                    "3. Qurilma ORU yuborishni kutmoqda (sensorlar tekshirilsin)\n"
                    "4. Firewall/router TCP reset yuborayapti\n"
                    "Yechim:\n"
                    "- Admin panelda device.hl7_connect_handshake: True/False\n"
                    "- .env: HL7_RECV_BEFORE_HANDSHAKE_MS=500\n"
                    "- Monitor menyusida HL7/central station yoqilganini tekshiring\n"
                    "=" * 60,
                    peer_ip,
                )
            else:
                logger.warning(
                    "HL7: %s — HL7/MSH ajratilmadi, lekin TCP qabul=%s bayt",
                    peer_ip, total_tcp_in,
                )
            return

        from django.db import close_old_connections

        ack_any = False
        for raw in raws:
            close_old_connections()
            try:
                _send_mllp_ack_for_incoming(conn, raw)
                ack_any = True
                from monitoring.hl7_parser import decode_hl7_text_best

                text = decode_hl7_text_best(raw)
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

    logger.info("HL7: Ma'lumot qayta ishlanmoqda peer=%s, matn_uzunligi=%s", peer_ip, len(text))
    
    device = resolve_hl7_device_by_peer_ip(peer_ip, allow_nat_loopback=True)
    if not device:
        logger.error(
            "HL7: QURILMA TOPILMADI — peer=%s (raw=%s). "
            "Yechim: 1) Admin panelda MonitorDevice yarating, 2) ip_address yoki local_ip=%s kiriting, "
            "3) hl7_enabled=True, 4) bed biriktiring, 5) bemorni qabul qiling. "
            "Yoki HL7_NAT_SINGLE_DEVICE_FALLBACK=true (bitta qurilma uchun avto-bog'lash).",
            peer_ip, peer_raw, peer_ip
        )
        return

    logger.info("HL7: Qurilma topildi device=%s (bed=%s)", device.id, device.bed_id)
    
    vitals = parse_hl7_vitals_best(raw)
    logger.info("HL7: Parser natijasi: %s", vitals)
    
    if vitals:
        result = apply_vitals_payload(device, vitals, mark_online=True)
        if result:
            logger.info(
                "HL7: Vitallar SAQLANDI — qurilma=%s, bemor=%s, vitals=%s",
                device.id, result.id, vitals
            )
        else:
            logger.warning(
                "HL7: Vitallar saqlanmadi — qurilma=%s da bed yoki bemor bog'lanmagan",
                device.id
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
        from monitoring.hl7_env import want_log_raw_preview

        if want_log_raw_preview():
            prev = text[: min(900, len(text))].replace("\r", "¶")
            logger.warning("HL7 diagn: xom matn (PHI bo'lishi mumkin): %s", prev)


def _serve_loop(host: str, port: int) -> None:
    """Port band bo'lsa yoki accept xato bersa — qayta urinish (Daphne qayta ishga tushmaguncha HL7 tiklanadi)."""
    while True:
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            srv.bind((host, port))
        except OSError as exc:
            logger.error(
                "HL7 bind xatolik %s:%s — %s. 60 soniyadan keyin qayta urinish.",
                host,
                port,
                exc,
            )
            with HL7_DIAG_LOCK:
                HL7_DIAG["bindError"] = str(exc)
            try:
                srv.close()
            except OSError:
                pass
            time.sleep(60)
            continue

        with HL7_DIAG_LOCK:
            HL7_DIAG["bindError"] = None

        srv.listen(32)
        logger.info("HL7 MLLP tinglayapti: %s:%s", host, port)
        try:
            while True:
                try:
                    conn, addr = srv.accept()
                    _apply_connection_recv_timeout(conn)
                    t = threading.Thread(
                        target=_handle_connection,
                        args=(conn, addr),
                        daemon=True,
                        name=f"hl7-{addr[0]}",
                    )
                    t.start()
                except OSError:
                    break
        finally:
            try:
                srv.close()
            except OSError:
                pass
        logger.warning("HL7: accept tsikli tugadi — 5s keyin qayta bog'lanish")
        time.sleep(5)


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


def get_hl7_listener_status() -> dict[str, object]:
    """API / audit: tinglovchi jarayoni, port, bind xatolik."""
    host, port, en = get_hl7_listen_config()
    with HL7_DIAG_LOCK:
        bind_err = HL7_DIAG.get("bindError")
    return {
        "enabled": en,
        "listenHost": host,
        "listenPort": port,
        "threadAlive": is_hl7_listener_alive(),
        "localPortAcceptsConnections": probe_hl7_tcp_listening() if en else False,
        "bindError": bind_err,
    }


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
