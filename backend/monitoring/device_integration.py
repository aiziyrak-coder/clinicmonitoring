"""
Qurilma vitallari — REST va HL7 dan kelgan ma'lumotlarni bemorga qo'llash va WS ga yuborish.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

from django.db import transaction
from django.db.models import Q

from monitoring.broadcast import broadcast_event

logger = logging.getLogger(__name__)
from monitoring.models import MonitorDevice, Patient, VitalHistoryEntry
from monitoring.simulation import calculate_news2


def is_loopback_peer_ip(peer_ip: str) -> bool:
    """127.0.0.1 / ::1 — mahalliy probe (connection-check), haqiqiy monitor emas."""
    s = (peer_ip or "").strip()
    if s in ("127.0.0.1", "::1"):
        return True
    if s.startswith("::ffff:") and s[7:].split("%", 1)[0] == "127.0.0.1":
        return True
    return False


def resolve_hl7_device_by_peer_ip(
    peer_ip: str, *, allow_nat_loopback: bool = False
) -> MonitorDevice | None:
    """
    TCP manbai IP bo'yicha MonitorDevice topish.
    VPS + uy router NAT holatida server 192.168.x.x emas, tashqi IP ni ko'radi —
    shuning uchun ip_address/local_ip bilan mos kelmasligi mumkin.
    Yagona `hl7_enabled=True` qurilma bo'lsa (kichik klinika), peer_ip ni avto `hl7_peer_ip` ga yozadi.

    Loopback (127.0.0.1) uchun NAT fallback odatda o'chiq — aks holda probe/texshiruv bitta
    qurilmani noto'g'ri «onlayn» qiladi va hl7_peer_ip=127.0.0.1 yozadi.
    Mahalliy HL7 sinovi uchun: allow_nat_loopback=True (faqat haqiqiy HL7 paket yo'lda).
    
    Yangi: Gateway orqali kelgan so'rovlar uchun IP subnet bo'yicha qidirish.
    """
    if not peer_ip or peer_ip == "unknown":
        logger.warning("HL7: Noto'g'ri peer_ip: %s", peer_ip)
        return None
    
    # 1. To'g'ri mos keluvchi IP larni qidirish
    dev = (
        MonitorDevice.objects.filter(hl7_enabled=True)
        .filter(
            Q(ip_address=peer_ip)
            | Q(local_ip=peer_ip)
            | Q(hl7_peer_ip=peer_ip)
        )
        .first()
    )
    if dev:
        logger.info("HL7: Qurilma to'g'ri IP moslashuvi bilan topildi: %s (peer=%s)", dev.id, peer_ip)
        return dev

    # 2. Loopback tekshiruvi
    if is_loopback_peer_ip(peer_ip) and not allow_nat_loopback:
        logger.debug("HL7: Loopback IP o'tkazib yuborildi (allow_nat_loopback=%s)", allow_nat_loopback)
        return None

    # 3. Subnet bo'yicha qidirish (masalan, 192.168.1.x)
    # Agar peer_ip 192.168.1.100 bo'lsa, 192.168.1. bilan boshlanuvchi barcha IP larni qidirish
    peer_parts = peer_ip.split(".")
    if len(peer_parts) == 4:
        subnet = ".".join(peer_parts[:3])  # masalan: 192.168.1
        
        # Bir xil subnetdagi qurilmalarni qidirish
        subnet_devices = MonitorDevice.objects.filter(
            hl7_enabled=True
        ).filter(
            Q(ip_address__startswith=subnet + ".")
            | Q(local_ip__startswith=subnet + ".")
            | Q(hl7_peer_ip__startswith=subnet + ".")
        )
        
        if subnet_devices.count() == 1:
            dev = subnet_devices.first()
            logger.info(
                "HL7: Subnet moslashuvi bilan topildi: %s (peer=%s, subnet=%s)",
                dev.id, peer_ip, subnet
            )
            # IP ni saqlash
            if dev.hl7_peer_ip != peer_ip:
                dev.hl7_peer_ip = peer_ip
                dev.save(update_fields=["hl7_peer_ip"])
            return dev

    # 4. NAT fallback - faqat bitta qurilma bo'lsa
    en = os.environ.get("HL7_NAT_SINGLE_DEVICE_FALLBACK", "true").lower()
    if en not in ("1", "true", "yes", "on"):
        return None

    qs = MonitorDevice.objects.filter(hl7_enabled=True)
    count = qs.count()
    
    if count == 0:
        logger.warning("HL7: Hech qanday HL7-enabled qurilma topilmadi")
        return None
    
    if count == 1:
        only = qs.first()
        assert only is not None
        logger.info(
            "HL7: NAT — peer=%s bitta yoqilgan qurilma %s bilan biriktirildi (local_ip=%s)",
            peer_ip,
            only.id,
            only.local_ip or only.ip_address,
        )
        if only.hl7_peer_ip != peer_ip:
            only.hl7_peer_ip = peer_ip
            only.save(update_fields=["hl7_peer_ip"])
        return only
    
    # Bir nechta qurilmalar bo'lsa, log qilish
    logger.warning(
        "HL7: peer=%s uchun %d ta qurilma topildi, aniq birini tanlab bo'lmadi. "
        "Qurilmani aniq IP bilan sozlang yoki HL7_NAT_SINGLE_DEVICE_FALLBACK=true qiling. "
        "Topilgan ID lar: %s",
        peer_ip, count, list(qs.values_list("id", flat=True))
    )
    return None


def _row_for_patient(p: Patient, history_override: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    hist = history_override
    if hist is None:
        hist = [
            {
                "timestamp": h.timestamp,
                "hr": h.hr,
                "spo2": h.spo2,
                "nibpSys": h.nibp_sys,
                "nibpDia": h.nibp_dia,
            }
            for h in p.history_entries.order_by("timestamp")
        ]
    sched = None
    if p.scheduled_interval_ms and p.scheduled_next_check:
        sched = {
            "intervalMs": p.scheduled_interval_ms,
            "nextCheckTime": p.scheduled_next_check,
        }
    return {
        "id": p.id,
        "vitals": {
            "hr": p.hr,
            "spo2": p.spo2,
            "nibpSys": p.nibp_sys,
            "nibpDia": p.nibp_dia,
            "rr": p.rr,
            "temp": p.temp,
            "nibpTime": p.nibp_time,
        },
        "alarm": {
            "level": p.alarm_level,
            "message": p.alarm_message or None,
            "patientId": p.alarm_patient_id or None,
        },
        "alarmLimits": p.alarm_limits or {},
        "deviceBattery": p.device_battery,
        "aiRisk": p.ai_risk,
        "news2Score": p.news2_score,
        "isPinned": p.is_pinned,
        "medications": None,
        "labs": None,
        "notes": None,
        "history": hist,
        "scheduledCheck": sched,
    }


@transaction.atomic
def apply_vitals_payload(
    device: MonitorDevice,
    payload: dict[str, Any],
    *,
    mark_online: bool = True,
) -> Patient | None:
    """REST yoki HL7 dan kelgan vitallarni saqlash va `vitals_update` yuborish."""
    now_ms = int(time.time() * 1000)
    
    # Qurilma online holatini yangilash
    if mark_online:
        device.status = MonitorDevice.Status.ONLINE
        device.last_seen = now_ms
        device.save(update_fields=["status", "last_seen"])
        logger.info("Device %s ONLINE holatga o'tkazildi", device.id)

    vital_keys = ("hr", "spo2", "nibpSys", "nibpDia", "rr", "temp")
    has_vitals = any(
        k in payload and payload[k] is not None for k in vital_keys
    )
    
    logger.info("Device %s: vitals tekshirilmoqda payload=%s has_vitals=%s", 
                device.id, payload, has_vitals)
    
    if not has_vitals:
        logger.warning("Device %s: payload da vitallar yo'q", device.id)
        return None

    if not device.bed_id:
        logger.error(
            "Vitals: qurilmada JOY (BED) BIRIKTIRILMAGAN — vitallar saqlanmaydi. "
            "Admin panelda device=%s ga bed biriktiring!",
            device.id,
        )
        return None

    patient = Patient.objects.select_for_update().filter(bed=device.bed).first()
    if not patient:
        logger.error(
            "Vitals: shu karavatta BEMOR YO'Q — vitallar saqlanmaydi. "
            "device=%s bed=%s. Admin panelda bemorni qabul qiling!",
            device.id,
            device.bed_id,
        )
        return None
    
    logger.info("Device %s: bemor topildi patient=%s", device.id, patient.id)

    if "hr" in payload and payload["hr"] is not None:
        patient.hr = int(payload["hr"])
    if "spo2" in payload and payload["spo2"] is not None:
        patient.spo2 = int(payload["spo2"])
    if "nibpSys" in payload and payload["nibpSys"] is not None:
        patient.nibp_sys = int(payload["nibpSys"])
    if "nibpDia" in payload and payload["nibpDia"] is not None:
        patient.nibp_dia = int(payload["nibpDia"])
    if "rr" in payload and payload["rr"] is not None:
        patient.rr = int(payload["rr"])
    if "temp" in payload and payload["temp"] is not None:
        patient.temp = float(payload["temp"])

    patient.nibp_time = now_ms
    patient.news2_score = calculate_news2(
        {
            "hr": patient.hr,
            "spo2": patient.spo2,
            "nibp_sys": patient.nibp_sys,
            "nibp_dia": patient.nibp_dia,
            "rr": patient.rr,
            "temp": patient.temp,
        }
    )
    patient.save()

    VitalHistoryEntry.objects.create(
        patient=patient,
        timestamp=now_ms,
        hr=float(patient.hr),
        spo2=float(patient.spo2),
        nibp_sys=float(patient.nibp_sys),
        nibp_dia=float(patient.nibp_dia),
    )
    excess_pks = list(
        VitalHistoryEntry.objects.filter(patient=patient)
        .order_by("-timestamp")
        .values_list("pk", flat=True)[60:]
    )
    if excess_pks:
        VitalHistoryEntry.objects.filter(pk__in=excess_pks).delete()

    broadcast_event(
        {"type": "vitals_update", "updates": [_row_for_patient(patient)]},
        device.clinic_id,
    )
    return patient


def mark_device_online_only(device: MonitorDevice) -> None:
    now_ms = int(time.time() * 1000)
    device.status = MonitorDevice.Status.ONLINE
    device.last_seen = now_ms
    device.save(update_fields=["status", "last_seen"])
