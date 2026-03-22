"""
Klinika bo'yicha filtrlash va WebSocket guruh nomi.
"""
from __future__ import annotations

from django.contrib.auth.models import User

from monitoring.models import Clinic, Patient


def monitoring_group_name(clinic_id: str) -> str:
    return f"monitoring_clinic_{clinic_id}"


def get_clinic_for_user(user: User) -> Clinic | None:
    if not user.is_authenticated:
        return None
    prof = getattr(user, "monitoring_profile", None)
    if prof:
        return prof.clinic
    if user.is_superuser:
        return Clinic.objects.order_by("id").first()
    return None


def patients_queryset_for_clinic(clinic: Clinic):
    return Patient.objects.filter(bed__room__department__clinic=clinic).prefetch_related(
        "medications", "labs", "notes"
    )
