import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model

# Définir User après l'importation (Django est déjà configuré à ce stade)
User = get_user_model()

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        print("WebSocket connecté")

    async def disconnect(self, close_code):
        print(f"WebSocket déconnecté, code: {close_code}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            # Traitement du message
            print(f"Message reçu: {data}")
            
            # Si c'est un message de chat, le transmettre au destinataire
            if data.get('type') == 'chat_message':
                recipient_id = data.get('recipient_id')
                if recipient_id:
                    await self.channel_layer.group_add(
                        f"user_{recipient_id}",
                        self.channel_name
                    )
                    
                    await self.channel_layer.group_send(
                        f"user_{recipient_id}",
                        {
                            'type': 'chat_message',
                            'message': data.get('message'),
                            'sender': data.get('sender'),
                            'recipient_id': recipient_id,
                            'timestamp': data.get('timestamp')
                        }
                    )
        except Exception as e:
            print(f"Erreur dans receive: {str(e)}")

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))