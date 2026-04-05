from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from monitoring import auth_views, views

router = DefaultRouter()
router.register(r"departments", views.DepartmentViewSet, basename="department")
router.register(r"rooms", views.RoomViewSet, basename="room")
router.register(r"beds", views.BedViewSet, basename="bed")
router.register(r"devices", views.DeviceViewSet, basename="device")
router.register(r"patients-crud", views.PatientViewSet, basename="patient-crud")

urlpatterns = [
    path("auth/session/",  auth_views.auth_session),
    path("auth/login/",    auth_views.auth_login),
    path("auth/logout/",   auth_views.auth_logout),
    path("auth/register/", auth_views.auth_register),
    # Routerdan oldin — aks holda `from-screen` pk deb olinadi
    path("devices/from-screen/", views.device_from_screen),
    path("", include(router.urls)),
    path("infrastructure/", views.infrastructure),
    path("patients/", views.patients_list),
    path("health/", views.health),
    path("hl7/", views.hl7_bridge_ingest),
    path("device/<str:ip>/vitals/", views.device_vitals_ingest),
    # Gateway uchun vitals (oxirgi / ixtiyoriy — ba'zi HTTP klientlar / yo'q qoldiradi)
    re_path(r"^vitals/?$", views.gateway_vitals_ingest),
    path("simulate-vitals/", views.SimulateVitalsView.as_view(), name="simulate-vitals"),
]
