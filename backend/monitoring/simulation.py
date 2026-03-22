"""
Real-time vitals simulyatsiyasi (oldingi Node server.ts mantig'i).
"""
from __future__ import annotations

import random
import threading
import time
from collections import defaultdict
from typing import Any

from django.db import transaction

from monitoring.broadcast import broadcast_event
from monitoring.models import Patient, VitalHistoryEntry

SIM_THREAD: threading.Thread | None = None
SIM_LOCK = threading.Lock()
TICK_RATE_MS = 1000
_ticks = 0

DEFAULT_LIMITS: dict[str, Any] = {
    "hr": {"low": 50, "high": 120},
    "spo2": {"low": 90, "high": 100},
    "nibpSys": {"low": 90, "high": 160},
    "nibpDia": {"low": 50, "high": 100},
    "rr": {"low": 8, "high": 30},
    "temp": {"low": 35.5, "high": 38.5},
}


def calculate_news2(v: dict[str, float | int]) -> int:
    score = 0
    rr = int(v["rr"])
    spo2 = int(v["spo2"])
    nibp_sys = int(v["nibp_sys"])
    hr = int(v["hr"])
    temp = float(v["temp"])

    if rr <= 8:
        score += 3
    elif 9 <= rr <= 11:
        score += 1
    elif 21 <= rr <= 24:
        score += 2
    elif rr >= 25:
        score += 3

    if spo2 <= 91:
        score += 3
    elif 92 <= spo2 <= 93:
        score += 2
    elif 94 <= spo2 <= 95:
        score += 1

    if nibp_sys <= 90:
        score += 3
    elif 91 <= nibp_sys <= 100:
        score += 2
    elif 101 <= nibp_sys <= 110:
        score += 1
    elif nibp_sys >= 220:
        score += 3

    if hr <= 40:
        score += 3
    elif 41 <= hr <= 50:
        score += 1
    elif 91 <= hr <= 110:
        score += 1
    elif 111 <= hr <= 130:
        score += 2
    elif hr >= 131:
        score += 3

    if temp <= 35.0:
        score += 3
    elif 35.1 <= temp <= 36.0:
        score += 1
    elif 38.1 <= temp <= 39.0:
        score += 1
    elif temp >= 39.1:
        score += 2

    return score


def _v_dict(p: Patient) -> dict[str, float | int]:
    return {
        "hr": p.hr,
        "spo2": p.spo2,
        "nibp_sys": p.nibp_sys,
        "nibp_dia": p.nibp_dia,
        "rr": p.rr,
        "temp": p.temp,
    }


def _tick_once() -> None:
    global _ticks
    _ticks += 1
    is_history_tick = _ticks % 5 == 0
    now_ms = int(time.time() * 1000)

    updates_by_clinic: dict[str, list[dict[str, Any]]] = defaultdict(list)

    with transaction.atomic():
        for p in Patient.objects.select_for_update().select_related(
            "bed__room__department"
        ).all():
            if p.alarm_level not in ("red", "blue"):
                if random.random() > 0.8:
                    p.hr = max(0, p.hr + random.randint(-1, 1))
                if random.random() > 0.9:
                    p.spo2 = min(100, max(85, p.spo2 + random.randint(-1, 1)))
                p.news2_score = calculate_news2(_v_dict(p))

            if is_history_tick and p.device_battery > 0:
                p.device_battery = max(0.0, p.device_battery - random.random() * 0.1)

            if is_history_tick and p.alarm_level not in ("red", "blue"):
                VitalHistoryEntry.objects.create(
                    patient=p,
                    timestamp=now_ms,
                    hr=float(p.hr),
                    spo2=float(p.spo2),
                    nibp_sys=float(p.nibp_sys),
                    nibp_dia=float(p.nibp_dia),
                )
                excess_pks = list(
                    VitalHistoryEntry.objects.filter(patient=p)
                    .order_by("-timestamp")
                    .values_list("pk", flat=True)[60:]
                )
                if excess_pks:
                    VitalHistoryEntry.objects.filter(pk__in=excess_pks).delete()

            if p.alarm_level not in ("red", "blue"):
                v = _v_dict(p)
                l = p.alarm_limits or DEFAULT_LIMITS
                msgs: list[str] = []
                is_yellow = False
                if v["hr"] < l["hr"]["low"]:
                    is_yellow = True
                    msgs.append("Past HR")
                if v["hr"] > l["hr"]["high"]:
                    is_yellow = True
                    msgs.append("Yuqori HR")
                if v["spo2"] < l["spo2"]["low"]:
                    is_yellow = True
                    msgs.append("Past SpO2")
                if v["nibp_sys"] > l["nibpSys"]["high"] or v["nibp_dia"] > l["nibpDia"]["high"]:
                    is_yellow = True
                    msgs.append("Yuqori Qon Bosimi")
                if v["nibp_sys"] < l["nibpSys"]["low"] or v["nibp_dia"] < l["nibpDia"]["low"]:
                    is_yellow = True
                    msgs.append("Past Qon Bosimi")

                if is_yellow:
                    p.alarm_level = "yellow"
                    p.alarm_message = ", ".join(msgs)
                    p.alarm_patient_id = p.id
                elif p.alarm_level == "yellow":
                    p.alarm_level = "none"
                    p.alarm_message = ""
                    p.alarm_patient_id = ""

            if is_history_tick:
                v = _v_dict(p)
                crit = v["spo2"] < 88 or v["hr"] > 130 or v["hr"] < 40
                if crit and p.ai_risk is None and random.random() > 0.5:
                    p.ai_risk = {
                        "probability": random.randint(80, 99),
                        "estimatedTime": f"{random.randint(1, 4)} soat ichida",
                        "reasons": [
                            x
                            for x in [
                                "SpO2 darajasi keskin pasaygan" if v["spo2"] < 88 else "",
                                "Taxikardiya kuzatilmoqda" if v["hr"] > 130 else "",
                                "Bradikardiya kuzatilmoqda" if v["hr"] < 40 else "",
                                "Qon bosimi beqarorligi",
                            ]
                            if x
                        ],
                        "recommendations": [
                            "Zudlik bilan shifokor ko'rigi",
                            "Kislorod terapiyasini boshlash",
                            "Reanimatsiya guruhini tayyorlash",
                        ],
                    }
                elif not crit and p.ai_risk is not None and random.random() > 0.8:
                    p.ai_risk = None

            if p.scheduled_interval_ms and p.scheduled_next_check and now_ms >= p.scheduled_next_check:
                v = _v_dict(p)
                is_deviated = (
                    v["hr"] < 60
                    or v["hr"] > 100
                    or v["spo2"] < 95
                    or v["nibp_sys"] < 90
                    or v["nibp_sys"] > 140
                    or v["nibp_dia"] < 60
                    or v["nibp_dia"] > 90
                    or v["rr"] < 12
                    or v["rr"] > 20
                    or v["temp"] < 36.0
                    or v["temp"] > 37.5
                )
                if is_deviated and p.alarm_level not in ("red", "blue"):
                    p.alarm_level = "purple"
                    p.alarm_message = "Rejali tekshiruv: Og'ish"
                    p.alarm_patient_id = p.id
                p.scheduled_next_check = now_ms + p.scheduled_interval_ms

            p.save()

            hist = None
            if is_history_tick:
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

            row: dict[str, Any] = {
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
            }
            if p.scheduled_interval_ms and p.scheduled_next_check:
                row["scheduledCheck"] = {
                    "intervalMs": p.scheduled_interval_ms,
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


def start_simulation_thread() -> None:
    global SIM_THREAD
    with SIM_LOCK:
        if SIM_THREAD and SIM_THREAD.is_alive():
            return
        SIM_THREAD = threading.Thread(target=_loop, daemon=True, name="monitoring-sim")
        SIM_THREAD.start()
