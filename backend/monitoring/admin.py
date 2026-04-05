from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.utils import timezone

from monitoring.models import (
    Bed,
    ClinicalNote,
    Clinic,
    ClinicRegistration,
    Department,
    LabResult,
    Medication,
    MonitorDevice,
    Patient,
    Room,
    UserProfile,
    VitalHistoryEntry,
)

admin.site.site_header = "MediCentral Admin"
admin.site.site_title  = "MediCentral"


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name", "id")


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    extra = 0
    max_num = 1
    raw_id_fields = ("clinic",)


class UserAdmin(BaseUserAdmin):
    inlines = [UserProfileInline]


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "clinic")
    list_filter = ("clinic",)
    raw_id_fields = ("user", "clinic")


# ─── KLINIKA RO'YXATDAN O'TISH ────────────────────────────────────────────────

@admin.register(ClinicRegistration)
class ClinicRegistrationAdmin(admin.ModelAdmin):
    list_display = (
        "clinic_name", "username", "status_badge",
        "director_name", "clinic_phone", "bed_count",
        "registered_at", "active_until", "is_active_now",
    )
    list_filter  = ("status",)
    search_fields= ("clinic_name", "username", "director_name", "clinic_phone", "clinic_email")
    readonly_fields = (
        "registered_at", "activated_at", "activated_by", "clinic", "clinic_user",
    )
    fieldsets = (
        ("Klinika ma'lumotlari", {
            "fields": ("clinic_name", "clinic_address", "clinic_phone", "clinic_email",
                       "director_name", "bed_count", "notes"),
        }),
        ("Kirish ma'lumotlari", {
            "fields": ("username",),
        }),
        ("Holat va muddat", {
            "fields": ("status", "active_until"),
            "description": (
                "Faollashtirish uchun: Holat = 'Faol', Faollik muddati = tugash sanasi. "
                "Bo'sh qolsa — cheksiz."
            ),
        }),
        ("Tizim (o'zgartirmang)", {
            "classes": ("collapse",),
            "fields": ("registered_at", "activated_at", "activated_by", "clinic", "clinic_user"),
        }),
    )
    actions = ["activate_selected", "suspend_selected", "reject_selected"]

    @admin.display(description="Holat")
    def status_badge(self, obj):
        colors = {
            "pending":   "#f59e0b",
            "active":    "#10b981",
            "suspended": "#ef4444",
            "rejected":  "#6b7280",
        }
        from django.utils.html import format_html
        color = colors.get(obj.status, "#999")
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">{}</span>',
            color, obj.get_status_display()
        )

    @admin.display(description="Faolmi?", boolean=True)
    def is_active_now(self, obj):
        return obj.is_active_now

    @admin.action(description="Tanlanganlarga: FAOLLASHTIRISH (hisob yaratish)")
    def activate_selected(self, request, queryset):
        from django.contrib.auth.models import User
        from django.contrib.auth.hashers import check_password
        from monitoring.models import UserProfile

        activated = 0
        for reg in queryset:
            if reg.status == ClinicRegistration.Status.ACTIVE and reg.clinic_user:
                messages.warning(request, f"{reg.clinic_name}: allaqachon faol.")
                continue

            # User yaratish yoki topish
            user, created = User.objects.get_or_create(
                username=reg.username,
                defaults={"is_staff": False, "is_superuser": False, "is_active": True},
            )
            if created:
                # Saqlangan parol hashini ishlatamiz
                user.password = reg._password_hash
                user.save()

            # Klinika yaratish
            import re
            clinic_id = re.sub(r"[^a-z0-9_]", "_", reg.clinic_name.lower())[:32]
            clinic_id = clinic_id.strip("_") or f"clinic_{reg.id}"
            clinic, _ = Clinic.objects.get_or_create(
                id=clinic_id,
                defaults={"name": reg.clinic_name},
            )

            # UserProfile
            UserProfile.objects.update_or_create(
                user=user, defaults={"clinic": clinic}
            )

            # Registration ni yangilash
            reg.status       = ClinicRegistration.Status.ACTIVE
            reg.clinic       = clinic
            reg.clinic_user  = user
            reg.activated_at = timezone.now()
            reg.activated_by = request.user
            reg.save()
            activated += 1

        if activated:
            messages.success(request, f"{activated} ta klinika faollashtirildi.")

    @admin.action(description="Tanlanganlarga: TO'XTATISH")
    def suspend_selected(self, request, queryset):
        n = queryset.update(status=ClinicRegistration.Status.SUSPENDED)
        # Foydalanuvchilarni ham bloklash
        user_ids = queryset.values_list("clinic_user_id", flat=True)
        User.objects.filter(id__in=user_ids).update(is_active=False)
        messages.success(request, f"{n} ta klinika to'xtatildi.")

    @admin.action(description="Tanlanganlarga: RAD ETISH")
    def reject_selected(self, request, queryset):
        n = queryset.update(status=ClinicRegistration.Status.REJECTED)
        messages.success(request, f"{n} ta so'rov rad etildi.")

    def save_model(self, request, obj, form, change):
        """Admin qo'lda saqlaganda ham faollashtirish ishlaydi."""
        super().save_model(request, obj, form, change)
        if obj.status == ClinicRegistration.Status.ACTIVE and not obj.clinic_user:
            # To'g'ridan-to'g'ri save orqali ham faollashtirish
            self.activate_selected(request, ClinicRegistration.objects.filter(pk=obj.pk))


admin.site.register(Department)
admin.site.register(Room)
admin.site.register(Bed)

@admin.register(MonitorDevice)
class MonitorDeviceAdmin(admin.ModelAdmin):
    list_display = (
        "id", "model", "ip_address", "local_ip",
        "hl7_peer_ip", "hl7_enabled", "bed", "status",
    )
    list_filter  = ("clinic", "hl7_enabled", "status")
    search_fields= ("id", "ip_address", "mac_address", "model")

admin.site.register(Patient)
admin.site.register(Medication)
admin.site.register(LabResult)
admin.site.register(ClinicalNote)
admin.site.register(VitalHistoryEntry)
