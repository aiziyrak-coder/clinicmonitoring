"""DRF viewsetlar uchun klinika filtri."""
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from monitoring.clinic_scope import get_clinic_for_user
from monitoring.models import Department, MonitorDevice


class ClinicScopedViewSetMixin:
    permission_classes = [IsAuthenticated]

    def get_clinic_or_error(self):
        user = self.request.user
        if user.is_superuser:
            return None
        c = get_clinic_for_user(user)
        if not c:
            raise PermissionDenied("Klinika profili topilmadi (admin orqali biriktiring).")
        return c

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_superuser:
            return qs
        c = get_clinic_for_user(user)
        if not c:
            return qs.none()
        model = qs.model
        if model is Department:
            return qs.filter(clinic=c)
        if model is Room:
            return qs.filter(department__clinic=c)
        if model is Bed:
            return qs.filter(room__department__clinic=c)
        if model is MonitorDevice:
            return qs.filter(clinic=c)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        user = self.request.user
        if not user.is_superuser:
            c = get_clinic_for_user(user)
            if c:
                ctx["clinic"] = c
        return ctx

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_superuser:
            serializer.save()
            return
        c = get_clinic_for_user(user)
        if not c:
            raise PermissionDenied("Klinika profili topilmadi.")
        m = serializer.Meta.model
        if m is Department:
            serializer.save(clinic=c)
            return
        if m is MonitorDevice:
            serializer.save(clinic=c)
            return
        serializer.save()
