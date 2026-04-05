"""Session-based login API (SPA + cookie) + klinika ro'yxatdan o'tish."""
from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from monitoring.clinic_scope import get_clinic_for_user


# ─── SESSION / LOGIN / LOGOUT ─────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def auth_session(request):
    """Joriy session holati. Har sahifa yuklanishida chaqiriladi."""
    user = request.user
    clinic = get_clinic_for_user(user) if user.is_authenticated else None

    # Faollik muddatini tekshirish
    if user.is_authenticated and not user.is_superuser:
        reg = _get_registration(user)
        if reg and not reg.is_active_now:
            logout(request)
            return Response(
                {"authenticated": False, "detail": "Obuna muddati tugagan. Admin bilan bog'laning."},
                status=status.HTTP_403_FORBIDDEN,
            )

    return Response({
        "authenticated": user.is_authenticated,
        "username":      user.username if user.is_authenticated else None,
        "csrfToken":     get_token(request),
        "clinic":        {"id": clinic.id, "name": clinic.name} if clinic else None,
        "isSuperuser":   user.is_authenticated and user.is_superuser,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def auth_login(request):
    """Login. Session cookie qaytaradi."""
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "Login yoki parol noto'g'ri."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # Obuna muddatini tekshirish (superuser uchun emas)
    if not user.is_superuser:
        reg = _get_registration(user)
        if reg is not None and not reg.is_active_now:
            msg = (
                "Hisobingiz to'xtatilgan."
                if reg.status == "suspended"
                else "Obuna muddati tugagan."
                if reg.active_until and reg.active_until < timezone.now()
                else "Hisobingiz hali tasdiqlanmagan. Admin bilan bog'laning."
            )
            return Response({"detail": msg}, status=status.HTTP_403_FORBIDDEN)

    login(request, user)
    clinic = get_clinic_for_user(user)
    reg = _get_registration(user) if not user.is_superuser else None

    return Response({
        "success":     True,
        "username":    user.username,
        "clinic":      {"id": clinic.id, "name": clinic.name} if clinic else None,
        "active_until": reg.active_until.isoformat() if reg and reg.active_until else None,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def auth_logout(request):
    logout(request)
    return Response({"success": True})


# ─── RO'YXATDAN O'TISH ────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def auth_register(request):
    """
    Yangi klinika ro'yxatdan o'tish.
    Yaratilgan hisob 'pending' holatda bo'ladi — admin tasdiqlagunga qadar kirish mumkin emas.
    """
    from monitoring.models import ClinicRegistration

    data = request.data
    clinic_name   = (data.get("clinic_name")   or "").strip()
    username      = (data.get("username")       or "").strip()
    password      = (data.get("password")       or "").strip()
    clinic_phone  = (data.get("clinic_phone")   or "").strip()
    clinic_email  = (data.get("clinic_email")   or "").strip()
    director_name = (data.get("director_name")  or "").strip()
    clinic_address= (data.get("clinic_address") or "").strip()
    bed_count     = int(data.get("bed_count") or 0)

    # Validatsiya
    errors = {}
    if not clinic_name:
        errors["clinic_name"] = "Klinika nomi talab qilinadi."
    if not username:
        errors["username"] = "Login (username) talab qilinadi."
    elif len(username) < 3:
        errors["username"] = "Login kamida 3 ta belgi bo'lishi kerak."
    if not password:
        errors["password"] = "Parol talab qilinadi."
    elif len(password) < 6:
        errors["password"] = "Parol kamida 6 ta belgi bo'lishi kerak."
    if errors:
        return Response({"detail": "Ma'lumotlar noto'g'ri.", "errors": errors},
                        status=status.HTTP_400_BAD_REQUEST)

    # Mavjudligini tekshirish
    from django.contrib.auth.models import User
    if User.objects.filter(username__iexact=username).exists():
        return Response(
            {"detail": "Bu login band. Boshqa login tanlang.", "errors": {"username": "Band"}},
            status=status.HTTP_409_CONFLICT,
        )
    if ClinicRegistration.objects.filter(username__iexact=username).exists():
        return Response(
            {"detail": "Bu login ro'yxatdan o'tgan. Boshqa login tanlang.", "errors": {"username": "Band"}},
            status=status.HTTP_409_CONFLICT,
        )

    # Parolni xeshlash (to'g'ridan-to'g'ri saqlamaymiz)
    from django.contrib.auth.hashers import make_password
    reg = ClinicRegistration.objects.create(
        clinic_name    = clinic_name,
        username       = username,
        _password_hash = make_password(password),
        clinic_phone   = clinic_phone,
        clinic_email   = clinic_email,
        director_name  = director_name,
        clinic_address = clinic_address,
        bed_count      = bed_count,
        status         = ClinicRegistration.Status.PENDING,
    )

    return Response({
        "success": True,
        "message": (
            "Ro'yxatdan o'tdingiz! Hisobingiz admin tomonidan tekshirilgandan so'ng faollashtiriladi. "
            "Tasdiqlanganingiz haqida xabardor bo'lasiz."
        ),
        "registration_id": reg.id,
    }, status=status.HTTP_201_CREATED)


# ─── YORDAMCHI ────────────────────────────────────────────────────────────────

def _get_registration(user):
    """Foydalanuvchiga tegishli ClinicRegistration ni qaytaradi."""
    from monitoring.models import ClinicRegistration
    try:
        return user.clinic_registration
    except Exception:
        return None
