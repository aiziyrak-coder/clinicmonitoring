import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from monitoring.clinic_scope import get_clinic_for_user
from monitoring.serializers import serialize_all_patients
from monitoring.ws_actions import handle_ws_message


class MonitoringConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope["user"]
        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return
        clinic = await database_sync_to_async(get_clinic_for_user)(user)
        if not clinic:
            await self.close(code=4002)
            return
        self.clinic_id = clinic.id
        self.group_name = f"monitoring_clinic_{clinic.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        patients = await database_sync_to_async(serialize_all_patients)(clinic.id)
        await self.send(
            text_data=json.dumps({"type": "initial_state", "patients": patients})
        )

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def monitoring_message(self, event):
        await self.send(text_data=json.dumps(event["payload"]))

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return
            
        # Heartbeat support
        if data.get("type") == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
            return
            
        await database_sync_to_async(handle_ws_message)(data, self.clinic_id)
