"""
MediCentral vitals loop — faqat real qurilma ma'lumotlari asosida hisob-kitob.
Simulyatsiya, random yoki soxta ma'lumot yo'q.
Hisoblash: alarm darajalari, vitals tarix.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Any

from django.db import transaction

from monitoring.broadcast import broadcast_event
from monitoring.models import Patient, VitalHistoryEntry

SIM_THREAD: threading.Thread | None = None
SIM_LOCK = threading.Lock()
TICK_RATE_MS = 5000  # 5 soniyada bir — alarm va vitals tarix

DEFAULT_LIMITS: dict[str, Any] = {
    "hr":      {"low": 50,   "high": 120},
    "spo2":    {"low": 90,   "high": 100},
    "nibpSys": {"low": 90,   "high": 160},
    "nibpDia": {"low": 50,   "high": 100},
    "rr":      {"low": 8,    "high": 30},
    "temp":    {"low": 35.5, "high": 38.5},
}


def _v_dict(p: Patient) -> dict[str, float | int]:
    return {
        "hr":       p.hr,
        "spo2":     p.spo2,
        "nibp_sys": p.nibp_sys,
        "nibp_dia": p.nibp_dia,
        "rr":       p.rr,
        "temp":     p.temp,
    }


def _tick_once() -> None:
    """
    Faqat real ma'lumotlarga asoslangan hisob-kitob:
    - Alarm darajasi: chegaraviy qiymatlarni tekshirish
    - Vitals tarix yozish (har 5 sekundda)
    Hech qanday random/soxta/AI ma'lumot yo'q.
    """
    now_ms = int(time.time() * 1000)
    updates_by_clinic: dict[str, list[dict[str, Any]]] = defaultdict(list)

    with transaction.atomic():
        for p in Patient.objects.select_for_update().select_related(
            "bed__room__department"
        ).all():
            changed = False

            # --- Alarm: faqat "none" yoki "yellow" holatda chegarani tekshirish ---
            # "red", "blue", "purple" — faqat tashqaridan (HL7 / shifokor) o'zgartiriladi
            if p.alarm_level in ("none", "yellow"):
                v = _v_dict(p)
                limits = p.alarm_limits or DEFAULT_LIMITS
                msgs: list[str] = []

                hr_lim    = limits.get("hr",      {})
                spo2_lim  = limits.get("spo2",    {})
                sys_lim   = limits.get("nibpSys", {})
                dia_lim   = limits.get("nibpDia", {})
                rr_lim    = limits.get("rr",      {})
                temp_lim  = limits.get("temp",    {})

                if isinstance(hr_lim, dict):
                    if v["hr"]   < hr_lim.get("low",   0):   msgs.append("Past HR")
                    if v["hr"]   > hr_lim.get("high", 999):  msgs.append("Yuqori HR")
                if isinstance(spo2_lim, dict):
                    if v["spo2"] < spo2_lim.get("low", 0):   msgs.append("Past SpO2")
                if isinstance(sys_lim, dict):
                    if v["nibp_sys"] > sys_lim.get("high", 999): msgs.append("Yuqori Qon Bosimi")
                    if v["nibp_sys"] < sys_lim.get("low",  0):   msgs.append("Past Qon Bosimi")
                if isinstance(dia_lim, dict):
                    if v["nibp_dia"] > dia_lim.get("high", 999): msgs.append("Yuqori AQB (diastolik)")
                    if v["nibp_dia"] < dia_lim.get("low",  0):   msgs.append("Past AQB (diastolik)")
                if isinstance(rr_lim, dict):
                    if v["rr"]   < rr_lim.get("low",   0):   msgs.append("Past nafas")
                    if v["rr"]   > rr_lim.get("high", 999):  msgs.append("Tez nafas")
                if isinstance(temp_lim, dict):
                    if v["temp"] < temp_lim.get("low",   0): msgs.append("Gipotermi")
                    if v["temp"] > temp_lim.get("high", 99): msgs.append("Issiqlik")

                new_level   = "yellow" if msgs else "none"
                new_message = ", ".join(msgs) if msgs else ""
                if new_level != p.alarm_level or new_message != (p.alarm_message or ""):
                    p.alarm_level   = new_level
                    p.alarm_message = new_message
                    if not msgs:
                        p.alarm_patient_id = ""
                    changed = True

            # --- Vitals tarixiga yozish (agar 0 dan farqli bo'lsa) ---
            if p.hr > 0 or p.spo2 > 0:
                VitalHistoryEntry.objects.create(
                    patient=p,
                    timestamp=now_ms,
                    hr=float(p.hr),
                    spo2=float(p.spo2),
                    nibp_sys=float(p.nibp_sys),
                    nibp_dia=float(p.nibp_dia),
                )
                # Eng ko'p 60 ta yozuv saqlash
                excess_pks = list(
                    VitalHistoryEntry.objects.filter(patient=p)
                    .order_by("-timestamp")
                    .values_list("pk", flat=True)[60:]
                )
                if excess_pks:
                    VitalHistoryEntry.objects.filter(pk__in=excess_pks).delete()

            if changed:
                p.save()

            # Broadcast uchun row
            hist = [
                {
                    "timestamp": h.timestamp,
                    "hr":        h.hr,
                    "spo2":      h.spo2,
                    "nibpSys":   h.nibp_sys,
                    "nibpDia":   h.nibp_dia,
                }
                for h in p.history_entries.order_by("timestamp")
            ]

            row: dict[str, Any] = {
                "id": p.id,
                "vitals": {
                    "hr":       p.hr,
                    "spo2":     p.spo2,
                    "nibpSys":  p.nibp_sys,
                    "nibpDia":  p.nibp_dia,
                    "rr":       p.rr,
                    "temp":     p.temp,
                    "nibpTime": p.nibp_time,
                },
                "alarm": {
                    "level":     p.alarm_level,
                    "message":   p.alarm_message or None,
                    "patientId": p.alarm_patient_id or None,
                },
                "alarmLimits":   p.alarm_limits or {},
                "deviceBattery": p.device_battery,
                "isPinned":      p.is_pinned,
                "history":       hist,
            }
            if p.scheduled_interval_ms and p.scheduled_next_check:
                row["scheduledCheck"] = {
                    "intervalMs":    p.scheduled_interval_ms,
                    "nextCheckTime": p.scheduled_next_check,
                }

            cid = None
            if p.bed_id and p.bed and p.bed.room and p.bed.room.department_id:
                cid = p.bed.room.department.clinic_id
            if cid:
                updates_by_clinic[cid].append(row)

    for cid, updates in updates_by_clinic.items():
        if updates:
            broadcast_event({"type": "vitals_update", "updates": updates}, cid)


def _loop() -> None:
    while True:
        try:
            _tick_once()
        except Exception:
            import traceback
            traceback.print_exc()
        time.sleep(TICK_RATE_MS / 1000.0)


def start_vitals_loop() -> None:
    """Haqiqiy vitals hisob-kitob loop: alarm darajalari. Simulyatsiya yo'q."""
    global SIM_THREAD
    with SIM_LOCK:
        if SIM_THREAD and SIM_THREAD.is_alive():
            return
        SIM_THREAD = threading.Thread(target=_loop, daemon=True, name="monitoring-vitals-loop")
        SIM_THREAD.start()


# Orqaga moslik uchun eski nom (apps.py ishlatadi)
start_simulation_thread = start_vitals_loop
