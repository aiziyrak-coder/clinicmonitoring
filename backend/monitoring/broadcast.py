import json
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from monitoring.clinic_scope import monitoring_group_name


def broadcast_event(payload: dict[str, Any], clinic_id: str) -> None:
    """Har bir klinika alohida Channels guruhi — boshqa klinika WS ga tushmaydi."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    group = monitoring_group_name(clinic_id)
    async_to_sync(channel_layer.group_send)(
        group,
        {"type": "monitoring.message", "payload": payload},
    )
