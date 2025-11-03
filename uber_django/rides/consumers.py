import json
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from rides.models import Ride
from rides.serializers import RideSerializer
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.authentication import JWTAuthentication
from jwt import DecodeError, ExpiredSignatureError
from channels.db import database_sync_to_async

class RideConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.ride_id = self.scope['url_route']['kwargs']['ride_id']
        self.room_group_name = f'ride_{self.ride_id}'

        # Authenticate token from query string
        query_string = self.scope['query_string'].decode()
        token = query_string.split("token=")[-1]
        self.user = await self.authenticate_token(token)
        if not self.user:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def ride_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'ride_update',
            'ride': event.get('ride', event.get('message', {}))
        }))

    @database_sync_to_async
    def authenticate_token(self, token):
        try:
            UntypedToken(token)  # Raises if invalid/expired
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            return user
        except (DecodeError, ExpiredSignatureError):
            return None

class DriverConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.driver_id = self.scope['url_route']['kwargs']['driver_id']
        self.room_group_name = f'driver_{self.driver_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        try:
            ride = await sync_to_async(self.get_current_ride)()
            if ride:
                # Serialize in thread-safe way
                serialized = await sync_to_async(lambda r: RideSerializer(r).data)(ride)
                await self.send(text_data=json.dumps({
                    'type': 'current_ride',
                    'ride': serialized
                }))
        except Exception as e:
            print("DriverConsumer connect error:", e)

    async def ride_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'ride_update',
            'ride': event['ride']
        }))

    def get_current_ride(self):
        return Ride.objects.filter(
            driver_id=self.driver_id,
            status__in=['ASSIGNED', 'PICKED_UP']
        ).first()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def new_ride_request(self, event):
        await self.send(text_data=json.dumps(event))
