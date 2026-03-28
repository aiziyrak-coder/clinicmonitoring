"""Session-based login API (SPA + cookie)."""
from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from monitoring.clinic_scope import get_clinic_for_user


@api_view(["GET"])
@permission_classes([AllowAny])
def auth_session(request):
    clinic = get_clinic_for_user(request.user) if request.user.is_authenticated else None
    return Response(
        {
            "authenticated": request.user.is_authenticated,
            "username": request.user.username if request.user.is_authenticated else None,
            "csrfToken": get_token(request),
            "clinic": {"id": clinic.id, "name": clinic.name} if clinic else None,
            "isSuperuser": request.user.is_authenticated and request.user.is_superuser,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt  # DRF + Django session authentication uchun CSRF exempt
def auth_login(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "Login yoki parol noto'g'ri."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    login(request, user)
    clinic = get_clinic_for_user(user)
    return Response(
        {
            "success": True,
            "username": user.username,
            "clinic": {"id": clinic.id, "name": clinic.name} if clinic else None,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def auth_logout(request):
    logout(request)
    return Response({"success": True})
