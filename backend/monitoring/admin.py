from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from monitoring.models import (
    Bed,
    ClinicalNote,
    Clinic,
    Department,
    LabResult,
    Medication,
    MonitorDevice,
    Patient,
    Room,
    UserProfile,
    VitalHistoryEntry,
)

admin.site.site_header = "ClinicMonitoring"
admin.site.site_title = "ClinicMonitoring"


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


admin.site.register(Department)
admin.site.register(Room)
admin.site.register(Bed)
admin.site.register(MonitorDevice)
admin.site.register(Patient)
admin.site.register(Medication)
admin.site.register(LabResult)
admin.site.register(ClinicalNote)
admin.site.register(VitalHistoryEntry)
