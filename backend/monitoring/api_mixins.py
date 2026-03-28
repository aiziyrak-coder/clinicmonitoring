"""DRF viewsetlar uchun klinika filtri."""
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from monitoring.clinic_scope import get_clinic_for_user
from monitoring.models import Clinic, Department, MonitorDevice


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
        if hasattr(model, "department"):
            return qs.filter(department__clinic=c)
        if hasattr(model, "room"):
            return qs.filter(room__department__clinic=c)
        if hasattr(model, "bed"):
            return qs.filter(bed__room__department__clinic=c)
        if model is Patient:
            # Endi Patient to'g'ridan-to'g'ri clinicga ega
            return qs.filter(clinic=c)
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
        """Create object with automatic clinic assignment."""
        user = self.request.user
        
        # Determine clinic for assignment
        if user.is_superuser:
            c = get_clinic_for_user(user)
            if not c:
                c = Clinic.objects.first()
        else:
            c = get_clinic_for_user(user)
            if not c:
                raise PermissionDenied("Klinika profili topilmadi.")
        
        from monitoring.models import Department, MonitorDevice, Room, Bed, Patient
        model = serializer.Meta.model
        
        # 1. Department & MonitorDevice (Directly linked to Clinic)
        if model in (Department, MonitorDevice):
            if "clinic" not in serializer.validated_data and c:
                serializer.save(clinic=c)
            else:
                serializer.save()
            return
        
        # 2. Patient (Needs clinic + optional bed)
        if model is Patient:
            extra = {}
            if "clinic" not in serializer.validated_data and c:
                extra["clinic"] = c
            
            if "bed" not in serializer.validated_data:
                bed_id = self.request.data.get("bedId") or self.request.data.get("bed_id")
                if bed_id:
                    try:
                        extra["bed"] = Bed.objects.get(id=bed_id)
                    except Bed.DoesNotExist:
                        pass
            serializer.save(**extra)
            return

        # 3. Room (Linked to Department)
        if model is Room:
            if "department" not in serializer.validated_data:
                dept_id = self.request.data.get("departmentId") or self.request.data.get("department_id")
                if dept_id:
                    try:
                        serializer.save(department=Department.objects.get(id=dept_id))
                        return
                    except Department.DoesNotExist:
                        from rest_framework import serializers
                        raise serializers.ValidationError({"departmentId": "Department not found"})
            serializer.save()
            return
        
        # 4. Bed (Linked to Room)
        if model is Bed:
            if "room" not in serializer.validated_data:
                room_id = self.request.data.get("roomId") or self.request.data.get("room_id")
                if room_id:
                    try:
                        serializer.save(room=Room.objects.get(id=room_id))
                        return
                    except Room.DoesNotExist:
                        from rest_framework import serializers
                        raise serializers.ValidationError({"roomId": "Room not found"})
            serializer.save()
            return
        
        # Default
        serializer.save()
