# import json
# from channels.generic.websocket import AsyncWebsocketConsumer
# from channels.layers import get_channel_layer
# from asgiref.sync import async_to_sync
# import logging

# logger = logging.getLogger(__name__)

# class ChatConsumer(AsyncWebsocketConsumer):
#     async def connect(self):
#         # Groupe général pour le chat
#         self.room_group_name = 'chat_room'
        
#         # Groupe spécifique à l'utilisateur pour les invitations
#         self.user_id = self.scope['user'].id
#         self.user_group_name = f'user_{self.user_id}'
        
#         logger.info(f"WebSocket connect - User ID: {self.user_id}")
        
#         # Rejoindre les deux groupes
#         await self.channel_layer.group_add(
#             self.room_group_name,
#             self.channel_name
#         )
#         await self.channel_layer.group_add(
#             self.user_group_name,
#             self.channel_name
#         )
        
#         logger.info(f"User {self.user_id} joined groups: {self.room_group_name} and {self.user_group_name}")
        
#         await self.accept()

#     async def disconnect(self, close_code):
#         logger.info(f"WebSocket disconnect - User ID: {self.user_id}, Code: {close_code}")
        
#         # Quitter les deux groupes
#         await self.channel_layer.group_discard(
#             self.room_group_name,
#             self.channel_name
#         )
#         await self.channel_layer.group_discard(
#             self.user_group_name,
#             self.channel_name
#         )

#     async def receive(self, text_data):
#         data = json.loads(text_data)
#         message_type = data.get('type', 'chat_message')
        
#         logger.info(f"WebSocket receive - Type: {message_type}, Data: {data}")
        
#         if message_type == 'game_invite':
#             recipient_group = f"user_{data['recipient_id']}"
#             logger.info(f"Sending game invite to group: {recipient_group}")
            
#             # Gestion spécifique des invitations de jeu
#             await self.channel_layer.group_send(
#                 recipient_group,
#                 {
#                     'type': 'game_invite',
#                     'sender': data['sender'],
#                     'sender_id': data['sender_id'],
#                     'recipient_id': data['recipient_id'],
#                     'message': data.get('message', '')
#                 }
#             )
#         else:
#             # Gestion des messages normaux
#             await self.channel_layer.group_send(
#                 self.room_group_name,
#                 {
#                     'type': 'chat_message',
#                     'message': data.get('message'),
#                     'sender': data.get('sender', 'Anonymous'),
#                     'recipient_id': data.get('recipient_id')
#                 }
#             )

#     async def chat_message(self, event):
#         logger.info(f"Sending chat message: {event}")
#         await self.send(text_data=json.dumps(event))

#     async def game_invite(self, event):
#         logger.info(f"Sending game invite: {event}")
#         # Envoyer uniquement l'invitation avec toutes les informations nécessaires
#         await self.send(text_data=json.dumps({
#             'type': 'game_invite',
#             'sender': event['sender'],
#             'sender_id': event['sender_id'],
#             'recipient_id': event['recipient_id'],
#             'message': event.get('message', '')
#         }))

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
import logging

logger = logging.getLogger(__name__)

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Obtenir l'utilisateur authentifié
        self.user = self.scope['user']
        self.user_id = self.user.id
        
        # Groupe spécifique à l'utilisateur pour les notifications
        self.user_group_name = f'user_{self.user_id}'
        
        # Rejoindre le groupe spécifique à l'utilisateur
        await self.channel_layer.group_add(
            self.user_group_name,
            self.channel_name
        )
        
        logger.info(f"WebSocket connecté - User ID: {self.user_id}")
        await self.accept()

    async def disconnect(self, close_code):
        # Quitter le groupe utilisateur
        await self.channel_layer.group_discard(
            self.user_group_name,
            self.channel_name
        )
        
        logger.info(f"WebSocket déconnecté - User ID: {self.user_id}, Code: {close_code}")

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type', 'chat_message')
        
        logger.info(f"WebSocket receive - Type: {message_type}, Data: {data}")
        
        if message_type == 'game_invite':
            # Gestion des invitations de jeu
            recipient_id = data.get('recipient_id')
            recipient_group = f'user_{recipient_id}'
            
            await self.channel_layer.group_send(
                recipient_group,
                {
                    'type': 'game_invite',
                    'sender': data['sender'],
                    'sender_id': data['sender_id'],
                    'recipient_id': data['recipient_id'],
                    'message': data.get('message', '')
                }
            )
        elif message_type == 'chat_message':
            # Gestion des messages de chat
            sender_id = self.user_id
            sender_username = data.get('sender')
            recipient_id = data.get('recipient_id')
            message_content = data.get('message', '')
            
            if not recipient_id:
                return
                
            # Envoyer au destinataire
            recipient_group = f'user_{recipient_id}'
            await self.channel_layer.group_send(
                recipient_group,
                {
                    'type': 'chat_message',
                    'message': message_content,
                    'sender': sender_username,
                    'sender_id': sender_id,
                    'recipient_id': recipient_id,
                    'is_sent': False
                }
            )
            
            # Renvoyer confirmation à l'expéditeur
            # Important: l'expéditeur doit aussi recevoir le message pour l'affichage en temps réel
            await self.channel_layer.group_send(
                self.user_group_name,
                {
                    'type': 'chat_message',
                    'message': message_content,
                    'sender': sender_username,
                    'sender_id': sender_id,
                    'recipient_id': recipient_id,
                    'is_sent': True  # Indique que c'est un message envoyé par l'utilisateur
                }
            )

    async def chat_message(self, event):
        # Envoyer le message au WebSocket
        await self.send(text_data=json.dumps(event))

    async def game_invite(self, event):
        # Envoyer l'invitation au WebSocket
        await self.send(text_data=json.dumps({
            'type': 'game_invite',
            'sender': event['sender'],
            'sender_id': event['sender_id'],
            'recipient_id': event['recipient_id'],
            'message': event.get('message', '')
        }))