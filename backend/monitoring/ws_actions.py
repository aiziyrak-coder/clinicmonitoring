"""
WebSocket orqali keladigan amallar (oldingi Socket.io handlerlari).
"""
from __future__ import annotations

import random
import time
from typing import Any

from django.db import transaction

from monitoring.broadcast import broadcast_event
from monitoring.models import Bed, ClinicalNote, Patient, ClinicalAuditLog
from monitoring.serializers import patient_to_dict, serialize_all_patients
from monitoring.simulation import DEFAULT_LIMITS


def _patient_in_clinic(patient_id: str | None, clinic_id: str) -> Patient | None:
    if not patient_id:
        return None
    return (
        Patient.objects.filter(
            id=patient_id,
            bed__room__department__clinic_id=clinic_id,
        )
        .select_related("bed__room__department")
        .first()
    )


@transaction.atomic
def handle_ws_message(data: dict[str, Any], clinic_id: str) -> dict[str, Any] | None:
    action = data.get("action")
    if action == "toggle_pin":
        p = Patient.objects.select_for_update().filter(
            id=data.get("patientId"),
            bed__room__department__clinic_id=clinic_id,
        ).first()
        if p:
            p.is_pinned = not p.is_pinned
            p.save(update_fields=["is_pinned"])
            p = Patient.objects.prefetch_related("medications", "labs", "notes").get(pk=p.pk)
            broadcast_event(
                {"type": "patient_refresh", "patient": patient_to_dict(p)},
                clinic_id,
            )
        return None

    if action == "add_note":
        p = _patient_in_clinic(data.get("patientId"), clinic_id)
        note = data.get("note") or {}
        if p:
            ClinicalNote.objects.create(
                patient=p,
                external_id="n" + str(int(time.time() * 1000)),
                text=note.get("text", ""),
                author=note.get("author", ""),
                time=int(time.time() * 1000),
            )
            p = Patient.objects.prefetch_related("medications", "labs", "notes").get(
                pk=p.pk
            )
            broadcast_event(
                {"type": "patient_refresh", "patient": patient_to_dict(p)},
                clinic_id,
            )
        return None

    if action == "acknowledge_alarm":
        p = Patient.objects.select_for_update().filter(
            id=data.get("patientId"),
            bed__room__department__clinic_id=clinic_id,
        ).first()
        if p and p.alarm_level != "none":
            if p.alarm_level in ("yellow", "purple"):
                p.alarm_level = "none"
                p.alarm_message = ""
                p.alarm_patient_id = ""
                p.save(update_fields=["alarm_level", "alarm_message", "alarm_patient_id"])
        return None

    if action == "set_schedule":
        p = Patient.objects.select_for_update().filter(
            id=data.get("patientId"),
            bed__room__department__clinic_id=clinic_id,
        ).first()
        interval = int(data.get("intervalMs") or 0)
        if p:
            if interval > 0:
                now = int(time.time() * 1000)
                p.scheduled_interval_ms = interval
                p.scheduled_next_check = now + interval
            else:
                p.scheduled_interval_ms = None
                p.scheduled_next_check = None
            p.save(
                update_fields=[
                    "scheduled_interval_ms",
                    "scheduled_next_check",
                ]
            )
        return None

    if action == "set_all_schedules":
        interval = int(data.get("intervalMs") or 0)
        now = int(time.time() * 1000)
        for p in Patient.objects.filter(bed__room__department__clinic_id=clinic_id):
            if interval > 0:
                p.scheduled_interval_ms = interval
                p.scheduled_next_check = now + interval
            else:
                p.scheduled_interval_ms = None
                p.scheduled_next_check = None
            p.save(
                update_fields=[
                    "scheduled_interval_ms",
                    "scheduled_next_check",
                ]
            )
        broadcast_event(
            {
                "type": "initial_state",
                "patients": serialize_all_patients(clinic_id),
            },
            clinic_id,
        )
        return None

    if action == "clear_alarm":
        p = Patient.objects.select_for_update().filter(
            id=data.get("patientId"),
            bed__room__department__clinic_id=clinic_id,
        ).first()
        if p and p.alarm_level == "purple":
            p.alarm_level = "none"
            p.alarm_message = ""
            p.alarm_patient_id = ""
            p.save(update_fields=["alarm_level", "alarm_message", "alarm_patient_id"])
        return None

    if action == "update_limits":
        p = Patient.objects.select_for_update().filter(
            id=data.get("patientId"),
            bed__room__department__clinic_id=clinic_id,
        ).first()
        limits = data.get("limits") or {}
        if p:
            merged = {**(p.alarm_limits or {}), **limits}
            p.alarm_limits = merged
            p.save(update_fields=["alarm_limits"])
        return None

    if action == "measure_nibp":
        p = Patient.objects.select_for_update().filter(
            id=data.get("patientId"),
            bed__room__department__clinic_id=clinic_id,
        ).first()
        if p:
            p.nibp_sys = random.randint(100, 140)
            p.nibp_dia = random.randint(60, 90)
            p.nibp_time = int(time.time() * 1000)
            p.save(update_fields=["nibp_sys", "nibp_dia", "nibp_time"])
        return None

    if action == "discharge_patient":
        pid = data.get("patientId")
        p = _patient_in_clinic(pid, clinic_id)
        if p:
            # Audit log yaratish (o'chirishdan oldin)
            ClinicalAuditLog.objects.create(
                action="DISCHARGE",
                patient=None, # Patient o'chiriladi, shuning uchun details ga yozamiz
                details={
                    "patient_id": pid,
                    "patient_name": p.name,
                    "room": p.room,
                    "diagnosis": p.diagnosis,
                    "reason": "Manual discharge from UI"
                }
            )
            p.delete()
            broadcast_event(
                {"type": "patient_discharged", "patientId": pid},
                clinic_id,
            )
        return None

    if action == "admit_patient":
        body = {k: v for k, v in data.items() if k != "action"}
        pid = "p" + str(random.randint(100000000, 999999999))
        now = int(time.time() * 1000)
        bed_id = body.get("bedId") or body.get("bed_id")
        bed: Bed | None = None
        room_label = (body.get("room") or "").strip()
        
        if bed_id:
            bed = (
                Bed.objects.select_related("room", "room__department")
                .filter(pk=bed_id, room__department__clinic_id=clinic_id)
                .first()
            )
            if bed:
                # Tekshirish: bu bo'sh joyda boshqa bemor bormi?
                from monitoring.models import Patient as PatientModel
                existing_patient = PatientModel.objects.filter(
                    bed=bed
                ).first()
                
                if existing_patient:
                    # Agar bu joy band bo'lsa, xato qaytarish
                    # Broadcast orqali frontendga xabar yuborish
                    from monitoring.broadcast import broadcast_event
                    broadcast_event(
                        {
                            "type": "error",
                            "message": "Bu joy band!",
                            "bedId": bed_id,
                            "occupiedBy": existing_patient.name
                        },
                        clinic_id,
                    )
                    return None
                
                dept = getattr(bed.room, "department", None)
                if dept:
                    room_label = f"{dept.name} — {bed.room.name}, {bed.name}"
                else:
                    room_label = f"{bed.room.name}, {bed.name}"

        p = Patient.objects.create(
            id=pid,
            name=body.get("name") or "",
            room=room_label,
            diagnosis=body.get("diagnosis") or "",
            doctor=body.get("doctor") or "",
            assigned_nurse=body.get("assignedNurse") or "",
            device_battery=0.0,
            admission_date=now,
            hr=0,
            spo2=0,
            nibp_sys=0,
            nibp_dia=0,
            rr=0,
            temp=0.0,
            nibp_time=None,
            alarm_level="none",
            alarm_limits={**DEFAULT_LIMITS},
            news2_score=0,
            is_pinned=False,
            scheduled_interval_ms=60000,
            scheduled_next_check=now + 60000,
            clinic_id=clinic_id,
            bed=bed,
        )
        
        # Audit log
        ClinicalAuditLog.objects.create(
            action="ADMIT",
            patient=p,
            details={
                "bed_id": bed_id,
                "room_label": room_label
            }
        )
        broadcast_event(
            {"type": "patient_admitted", "patient": patient_to_dict(p)},
            clinic_id,
        )
        return None

    return None
