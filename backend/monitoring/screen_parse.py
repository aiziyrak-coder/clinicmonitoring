"""
Monitor ekranidan (HL7/tarmoq sozlamalari) rasm orqali JSON chiqarish — Gemini Vision.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

_PARSE_PROMPT = """You are reading a medical patient monitor screen photo (often Russian UI: Интернет, Internet tab).
Extract network configuration for HL7 and TCP.

Return ONLY valid JSON (no markdown), with these keys:
{
  "deviceModel": "string (e.g. Creative Medical K12 from visible branding)",
  "serverIp": "IPv4 — IP shown as server / MedCentral server target (often labeled IP-адрес сервера)",
  "localIp": "IPv4 — local device IP (Локальный IP адрес)",
  "hl7Port": 6006,
  "hl7Enabled": true,
  "macAddress": "XX:XX:XX:XX:XX:XX in uppercase with colons",
  "subnetMask": "255.255.255.0",
  "gateway": "192.168.0.1"
}

If a field is unreadable, use null for that key. Prefer digits visible on screen.
"""


class ScreenParseError(Exception):
    """Rasmni tahlil qilishda xatolik."""


def _extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        text = m.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(text[start : end + 1])
        else:
            raise ScreenParseError("JSON parse qilinmadi — model javobi noto'g'ri.") from None
    if not isinstance(data, dict):
        raise ScreenParseError("Kutilgan obyekt JSON emas.")
    return data


def parse_monitor_screen_image(raw: bytes) -> dict[str, Any]:
    """
    Rasmni Gemini Vision bilan tahlil qiladi, tarmoq maydonlarini qaytaradi.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ImproperlyConfigured(
            "GEMINI_API_KEY muhit o'zgaruvchisi sozlanmagan — rasmni tahlil qilish mumkin emas."
        )

    try:
        from PIL import Image
    except ImportError as exc:
        raise ScreenParseError("Pillow kutubxonasi o'rnatilmagan.") from exc

    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise ScreenParseError("google-generativeai kutubxonasi o'rnatilmagan.") from exc

    import io

    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        raise ScreenParseError("Rasm fayli o'qilmadi yoki buzilgan.") from exc
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    elif img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg

    genai.configure(api_key=api_key)
    model_name = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.0-flash-lite")
    model = genai.GenerativeModel(model_name)

    try:
        response = model.generate_content([_PARSE_PROMPT, img])
    except Exception as exc:
        logger.exception("Gemini vision xatolik")
        raise ScreenParseError(f"Gemini xatolik: {exc}") from exc

    text = getattr(response, "text", None) or ""
    if not text.strip() and response.candidates:
        parts = []
        for c in response.candidates:
            for p in getattr(c.content, "parts", []) or []:
                if hasattr(p, "text") and p.text:
                    parts.append(p.text)
        text = "\n".join(parts)

    if not text.strip():
        raise ScreenParseError("Model bo'sh javob qaytardi — rasmni aniqroq yuklang.")

    return _extract_json_object(text)


def normalized_device_payload(parsed: dict[str, Any], bed_id: str) -> dict[str, Any]:
    """MonitorDeviceSerializer uchun body (API kalitlari)."""
    local = parsed.get("localIp") or parsed.get("local_ip")
    server = parsed.get("serverIp") or parsed.get("server_ip")
    port = parsed.get("hl7Port") or parsed.get("hl7_port") or 6006
    try:
        port = int(port)
    except (TypeError, ValueError):
        port = 6006
    hl7 = parsed.get("hl7Enabled")
    if hl7 is None:
        hl7 = parsed.get("hl7_enabled")
    if hl7 is None:
        hl7 = True

    if not local or not isinstance(local, str):
        raise ScreenParseError("Lokal IP aniqlanmadi — rasm sifatini yaxshilang.")

    mac = parsed.get("macAddress") or parsed.get("mac_address") or ""
    if isinstance(mac, str):
        mac = mac.strip()

    model_name = parsed.get("deviceModel") or parsed.get("device_model") or "Monitor"
    if not isinstance(model_name, str):
        model_name = str(model_name)

    out: dict[str, Any] = {
        "ipAddress": str(local).strip(),
        "macAddress": mac,
        "model": model_name.strip() or "Monitor",
        "localIp": str(local).strip(),
        "hl7Enabled": bool(hl7),
        "hl7Port": port,
        "subnetMask": (parsed.get("subnetMask") or parsed.get("subnet_mask") or "") or "",
        "gateway": (parsed.get("gateway") or "") or "",
        "bedId": bed_id,
    }
    if server and isinstance(server, str) and server.strip():
        out["serverTargetIp"] = server.strip()
    else:
        out["serverTargetIp"] = None

    return out
