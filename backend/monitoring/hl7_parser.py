"""
HL7 v2.x xabarlardan (asosan ORU^R01) vital ko'rsatkichlarni ajratish.
Turli monitorlar OBX-3 ni boshqacha to'ldiradi; Creative Medical va boshqalar uchun kengaytirilgan.
"""
from __future__ import annotations

import re
from typing import Any

# LOINC va umumiy kalit so'zlar
_LOINC_HR = frozenset({"8867-4", "heart rate", "hr", "pulse", "pr"})
_LOINC_SPO2 = frozenset({"2708-6", "spo2", "sp o2", "oxygen saturation", "sao2"})
_LOINC_TEMP = frozenset({"8310-5", "body temperature", "temp", "temperature"})
_LOINC_RR = frozenset({"9279-1", "respiratory rate", "rr"})
_NIBP_RE = re.compile(r"^(\d{2,3})\s*/\s*(\d{2,3})$")
_NUMERIC = re.compile(r"^\d+(\.\d+)?$")


def _norm_obx3_id(field: str) -> str:
    f = field.strip().lower()
    parts = f.split("^")
    for p in parts:
        p = p.strip().lower()
        if p.isdigit() and len(p) >= 3:
            return p
    return f


def _classify_obx3(field: str) -> str | None:
    nid = _norm_obx3_id(field)
    blob = nid.replace("|", " ").lower()
    # Rus / kirill: ЧСС (yurak urishi), ЧПС ba'zan noto'g'ri, SpO2
    if any(
        x in blob
        for x in (
            "чсс",
            "чпс",
            "пульс",
            "пульсокс",
            "сердеч",
            "chss",
            "chps",
            "css",
        )
    ):
        return "hr"
    if any(x in blob for x in ("спо2", "spo2", "сатурац", "кислород", "насыщ")):
        return "spo2"
    blob_ascii = nid.replace("|", " ")
    for token in blob_ascii.split():
        t = token.strip().lower()
        if t in _LOINC_HR or "heart" in blob or "pulse" in blob or blob.startswith("8867"):
            return "hr"
        if t in _LOINC_SPO2 or "spo2" in blob or "oxygen" in blob or "2708" in blob:
            return "spo2"
        if t in _LOINC_TEMP or "temp" in blob or "8310" in blob:
            return "temp"
        if t in _LOINC_RR or "resp" in blob:
            return "rr"
        if "nibp" in blob or "blood pressure" in blob or "n_bp" in blob or "bp" == t:
            return "nibp_combined"
    if "mdc" in blob and ("hr" in blob or "heart" in blob or "ecg" in blob):
        return "hr"
    if "mdc" in blob and ("spo2" in blob or "pulse ox" in blob):
        return "spo2"
    return None


def _extract_obx_value(parts: list[str]) -> str:
    """OBX qiymati ba'zan 5–20+ maydonlardan birida (ishlab chiqaruvchiga qarab)."""
    for i in range(5, min(len(parts), 25)):
        raw = parts[i].strip() if i < len(parts) else ""
        if not raw:
            continue
        first = raw.split("^")[0].strip()
        if _NIBP_RE.match(first.replace(" ", "")):
            return first
        if _NUMERIC.match(first.replace(",", ".")):
            return first
        if "/" in first and re.search(r"\d{2,3}\s*/\s*\d{2,3}", first):
            return first
    return parts[5].strip() if len(parts) > 5 else ""


def _parse_float(s: str) -> float | None:
    s = s.strip()
    if not s:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _heuristic_kind_from_value(v: int, out: dict[str, Any]) -> str | None:
    """
    OBX-3 noma'lum bo'lganda. 70–84 oralig'i HR (masalan 72) ham, SpO2 ham bo'lishi mumkin —
    SpO2 uchun avval 85+ (monitorlar odatan 90+).
    """
    if (35 <= v <= 69) or (101 <= v <= 220):
        return "hr"
    if 85 <= v <= 100 and "spo2" not in out:
        return "spo2"
    if 70 <= v <= 84 and "hr" not in out:
        return "hr"
    if 70 <= v <= 100 and "spo2" not in out:
        return "spo2"
    if 35 <= v <= 220 and "hr" not in out:
        return "hr"
    return None


def _parse_one_obx_line(parts: list[str], out: dict[str, Any]) -> None:
    if len(parts) < 4:
        return
    obx3 = parts[3] if len(parts) > 3 else ""
    value = _extract_obx_value(parts)
    kind = _classify_obx3(obx3)

    if not kind:
        vs = value.strip()
        if vs.isdigit() or (_NUMERIC.match(vs.replace(",", "."))):
            v = int(round(float(vs.replace(",", "."))))
            kind = _heuristic_kind_from_value(v, out)
        if not kind:
            return

    if kind == "nibp_combined":
        m = _NIBP_RE.match(value.replace(" ", ""))
        if m:
            out["nibpSys"] = int(m.group(1))
            out["nibpDia"] = int(m.group(2))
        return

    fv = _parse_float(value)
    if fv is None:
        return
    if kind == "hr":
        out["hr"] = int(round(fv))
    elif kind == "spo2":
        out["spo2"] = int(round(fv))
    elif kind == "temp":
        out["temp"] = round(fv, 1)
    elif kind == "rr":
        out["rr"] = int(round(fv))


def _fallback_ordered_obx(text: str) -> dict[str, Any]:
    """
    Hech narsa topilmasa: OBX qatorlaridagi raqamlarni ketma-ketlikda YUCh, SpO2, AQB deb olish.
    Ko'p monitorlar bir xil tartibda yuboradi.
    """
    out: dict[str, Any] = {}
    text = text.replace("\n", "\r")
    nums: list[float] = []
    nibp_done = False

    for line in text.split("\r"):
        line = line.strip()
        if not line.upper().startswith("OBX|"):
            continue
        parts = line.split("|")
        value = _extract_obx_value(parts)
        if not value:
            continue
        m = _NIBP_RE.match(value.replace(" ", ""))
        if m:
            out["nibpSys"] = int(m.group(1))
            out["nibpDia"] = int(m.group(2))
            nibp_done = True
            continue
        fv = _parse_float(value)
        if fv is None:
            continue
        v = float(fv)
        nums.append(v)

    if nums:
        i = 0
        if "hr" not in out and i < len(nums):
            v = int(round(nums[i]))
            if 35 <= v <= 220:
                out["hr"] = v
                i += 1
        if "spo2" not in out and i < len(nums):
            v = int(round(nums[i]))
            if 50 <= v <= 100:
                out["spo2"] = v
                i += 1
        if not nibp_done and "nibpSys" not in out and i + 1 < len(nums):
            sys_, dia_ = int(round(nums[i])), int(round(nums[i + 1]))
            if 40 <= sys_ <= 260 and 30 <= dia_ <= 180:
                out["nibpSys"] = sys_
                out["nibpDia"] = dia_

    return out


def _sequential_obx_numeric_fallback(text: str) -> dict[str, Any]:
    """
    OBX-3 tavsifi tushunarsiz bo'lsa ham OBX-5 raqamlaridan YUCh va SpO2.
    Ikki qiymat: SpO2 odatan 70–100 ichida yuqori (98), HR pastki (72).
    Bitta qiymat 72 kabi: SpO2 kamdan-kam <85 — HR deb olinadi.
    """
    out: dict[str, Any] = {}
    sequence: list[int] = []
    for line in text.replace("\n", "\r").split("\r"):
        line = line.strip()
        if not line.upper().startswith("OBX|"):
            continue
        parts = line.split("|")
        if len(parts) < 6:
            continue
        val = _extract_obx_value(parts)
        if not val or _NIBP_RE.match(val.replace(" ", "")):
            continue
        fv = _parse_float(val)
        if fv is None:
            continue
        v = int(round(fv))
        if 25 <= v <= 250:
            sequence.append(v)
    if not sequence:
        return out

    in_spo = [v for v in sequence if 70 <= v <= 100]
    strict_spo = [v for v in sequence if 85 <= v <= 100]

    if len(sequence) >= 2 and in_spo:
        out["spo2"] = max(in_spo)
        for v in sequence:
            if 35 <= v <= 220 and v != out["spo2"]:
                out["hr"] = v
                break
        return out

    if len(sequence) == 1:
        v = sequence[0]
        if 35 <= v <= 69 or 101 <= v <= 220:
            out["hr"] = v
        elif 70 <= v <= 100:
            if v >= 92:
                out["spo2"] = v
            else:
                out["hr"] = v
        return out

    if strict_spo:
        out["spo2"] = strict_spo[0]
    elif in_spo:
        out["spo2"] = max(in_spo)
    spo2_val = out.get("spo2")
    for v in sequence:
        if 35 <= v <= 220 and v != spo2_val:
            out["hr"] = v
            break
    return out


def _text_skip_header_segments(text: str) -> str:
    """MSH/PID/PV1 qatorlarida vaqt/ID raqamlari HR/SpO2 bilan aralashmasin."""
    lines: list[str] = []
    for line in text.replace("\n", "\r").split("\r"):
        u = line.strip().upper()
        if u.startswith(("MSH|", "PID|", "PV1|", "EVN|")):
            continue
        lines.append(line)
    return "\r".join(lines)


# Ba'zi monitorlar vitallarni OBX o'rniga OBR, NTE, ST yoki Z* segmentlarida yuboradi.
_PIPE_VITAL_LINE = re.compile(
    r"^(OBX|OBR|NTE|ST|Z[A-Z0-9]{1,10})\|",
    re.I,
)


def _harvest_obx_numeric_scan(text: str) -> dict[str, Any]:
    """
    OBX-3 noto'g'ri yoki bo'sh bo'lsa ham pipe-segment qatorlaridagi raqamlarni yig'adi.
    OBR/NTE/ST/Z* qatorlari ham qo'shildi (Creative Medical / OEM variantlari).
    Alohida maydonlarda sys/dia (120 va 80) kabi juftliklarni NIBP deb ajratadi.
    """
    out: dict[str, Any] = {}
    text = text.replace("\n", "\r")
    hrs: list[int] = []
    spos: list[int] = []
    temps: list[float] = []

    for line in text.split("\r"):
        line = line.strip()
        if not line or not _PIPE_VITAL_LINE.match(line):
            continue
        parts = line.split("|")
        i = 5
        n = min(len(parts), 36)
        while i < n:
            raw = parts[i].strip()
            if not raw:
                i += 1
                continue
            first = raw.split("^")[0].strip().replace(",", ".")
            m = _NIBP_RE.match(first.replace(" ", ""))
            if m:
                out["nibpSys"] = int(m.group(1))
                out["nibpDia"] = int(m.group(2))
                i += 1
                continue
            if i + 1 < n:
                a = _parse_float(parts[i].split("^")[0].strip().replace(",", "."))
                b = _parse_float(parts[i + 1].split("^")[0].strip().replace(",", "."))
                if a is not None and b is not None:
                    ia, ib = int(round(a)), int(round(b))
                    if 40 <= ia <= 250 and 30 <= ib <= 180 and ia >= ib:
                        out["nibpSys"] = ia
                        out["nibpDia"] = ib
                        i += 2
                        continue
            fv = _parse_float(first)
            if fv is None:
                i += 1
                continue
            v = int(round(fv))
            fvv = float(fv)
            if 35 <= v <= 220:
                hrs.append(v)
            if 70 <= v <= 100:
                spos.append(v)
            if 30.0 <= fvv <= 43.0:
                temps.append(round(fvv, 1))
            i += 1

    if hrs:
        out.setdefault("hr", hrs[-1])
    if spos:
        out.setdefault("spo2", max(spos))
    if temps:
        out.setdefault("temp", temps[-1])
    return out


def _fallback_regex_scan(text: str) -> dict[str, Any]:
    """
    OBX maydonlari noto'g'ri bo'lsa: NIBP (sys/dia) va matndagi HR/SpO2 kalit so'zlari.
    Tasodifiy raqamlarni taxmin qilib olmaymiz (PID/MSH bilan aralashadi).
    """
    out: dict[str, Any] = {}
    body = _text_skip_header_segments(text)
    m = re.search(r"\b(\d{2,3})\s*/\s*(\d{2,3})\b", body)
    if m:
        s, d = int(m.group(1)), int(m.group(2))
        if 50 <= s <= 280 and 30 <= d <= 200 and s >= d:
            out["nibpSys"] = s
            out["nibpDia"] = d

    hr_m = re.search(
        r"(?:^|[|\s])(?:PR|HR|PULSE|HEART\s*RATE)[^|\d]{0,24}(\d{2,3})\b",
        body,
        re.IGNORECASE,
    )
    if hr_m:
        v = int(hr_m.group(1))
        if 35 <= v <= 220:
            out["hr"] = v
    hr_cyr = re.search(
        r"(?:ЧСС|ЧПС|CHSS|CHPS)[^|\d]{0,32}(\d{2,3})\b",
        body,
    )
    if hr_cyr and "hr" not in out:
        v = int(hr_cyr.group(1))
        if 35 <= v <= 220:
            out["hr"] = v
    spo2_m = re.search(
        r"(?:SPO2|SAO2|O2\s*SAT|OXYGEN\s*SAT)[^|\d]{0,24}(\d{2,3})\b",
        body,
        re.IGNORECASE,
    )
    if spo2_m:
        v = int(spo2_m.group(1))
        if 70 <= v <= 100:
            out["spo2"] = v
    spo2_cyr = re.search(
        r"(?:СПО2|СПО\s*2|SpO2)[^|\d]{0,32}(\d{2,3})\b",
        body,
        re.IGNORECASE,
    )
    if spo2_cyr and "spo2" not in out:
        v = int(spo2_cyr.group(1))
        if 70 <= v <= 100:
            out["spo2"] = v
    # |ЧСС|105|, |HR|110| — pipe bilan ajratilgan qisqa format
    pipe_hr = re.search(
        r"\|(?:HR|PR|PULSE|ПУЛЬС|ЧСС|ЧПС)\|(\d{2,3})\b",
        body,
        re.IGNORECASE,
    )
    if pipe_hr and "hr" not in out:
        v = int(pipe_hr.group(1))
        if 35 <= v <= 220:
            out["hr"] = v
    pipe_spo = re.search(r"\|(?:SPO2|SpO2|СПО2)\|(\d{2,3})\b", body, re.IGNORECASE)
    if pipe_spo and "spo2" not in out:
        v = int(pipe_spo.group(1))
        if 70 <= v <= 100:
            out["spo2"] = v

    return out


def hl7_segment_type_summary(hl7_text: str) -> str:
    """Diagnostika: qaysi segmentlar bor (PHI chiqarmasdan)."""
    types: list[str] = []
    for line in hl7_text.replace("\n", "\r").split("\r"):
        line = line.strip()
        if "|" not in line:
            continue
        seg = line.split("|", 1)[0].strip().upper()[:12]
        if seg and seg not in types:
            types.append(seg)
    return ",".join(types[:40])


def parse_hl7_vitals(hl7_text: str) -> dict[str, Any]:
    """
    OBX segmentlaridan hr, spo2, temp, rr, nibpSys, nibpDia ni chiqaradi.
    """
    out: dict[str, Any] = {}
    text = hl7_text.replace("\n", "\r")

    for line in text.split("\r"):
        line = line.strip()
        if not re.match(r"^OBX\|", line, re.I):
            continue
        parts = line.split("|")
        _parse_one_obx_line(parts, out)

    if not out:
        out = _fallback_ordered_obx(text)
    seq = _sequential_obx_numeric_fallback(text)
    for k, v in seq.items():
        if k not in out:
            out[k] = v
    reg = _fallback_regex_scan(text)
    for k, v in reg.items():
        if k not in out:
            out[k] = v
    harvest = _harvest_obx_numeric_scan(text)
    for k, v in harvest.items():
        if k not in out:
            out[k] = v

    return out


def hl7_raw_contains_msh_segment(raw: bytes) -> bool:
    """HL7 MSH — UTF-8 yoki UTF-16 (ACK / tekshiruv uchun)."""
    if b"MSH|" in raw:
        return True
    if b"M\x00S\x00H\x00|\x00" in raw:
        return True
    if b"\x00\x4d\x00\x53\x00\x48\x00\x7c" in raw:
        return True
    return False


def decode_hl7_text_best(raw: bytes) -> str:
    """
    Log va ACK uchun matn — MSH bor kodlashni ustuvor tanlaydi.
    """
    buf = raw.lstrip(b"\xef\xbb\xbf")
    if buf.startswith(b"\xff\xfe"):
        buf = buf[2:]
    elif buf.startswith(b"\xfe\xff"):
        buf = buf[2:]
    for enc in ("utf-8", "utf-16-le", "utf-16-be", "cp1251", "latin-1"):
        try:
            if enc in ("utf-16-le", "utf-16-be") and len(buf) % 2 == 1:
                continue
            t = buf.decode(enc, errors="replace")
            if "MSH|" in t:
                return t
        except (LookupError, UnicodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def parse_hl7_vitals_best(raw: bytes) -> dict[str, Any]:
    """
    UTF-8, CP1251 va latin-1 bilan sinab, eng ko'p maydonni to'ldirgan natijani tanlaydi,
    qolgan kodlashlardan yetishmayotgan kalitlarni qo'shadi (bir xil xabarda aralash kodlash).
    """
    raw = raw.lstrip(b"\xef\xbb\xbf")
    if raw.startswith(b"\xff\xfe"):
        raw = raw[2:]
    elif raw.startswith(b"\xfe\xff"):
        raw = raw[2:]
    candidates: list[tuple[int, dict[str, Any]]] = []
    for enc in ("utf-8", "utf-16-le", "utf-16-be", "cp1251", "latin-1", "gbk"):
        try:
            if enc in ("utf-16-le", "utf-16-be") and len(raw) % 2 == 1:
                continue
            t = raw.decode(enc, errors="replace")
        except LookupError:
            continue
        v = parse_hl7_vitals(t)
        if v:
            candidates.append((len(v), v))
    if not candidates:
        return {}
    candidates.sort(key=lambda x: -x[0])
    merged = dict(candidates[0][1])
    for _, v in candidates[1:]:
        for k, val in v.items():
            if k not in merged:
                merged[k] = val
    return merged
