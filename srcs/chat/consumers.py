import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model

# Définir User après l'importation (Django est déjà configuré à ce stade)
User = get_user_model()

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        
        # Vérifier si l'utilisateur est authentifié
        if self.user.is_authenticated:
            # Créer un groupe personnel pour l'utilisateur
            self.user_group_name = f"user_{self.user.id}"
            
            # Ajouter l'utilisateur à son propre groupe
            await self.channel_layer.group_add(
                self.user_group_name,
                self.channel_name
            )
            
            print(f"WebSocket connecté pour l'utilisateur {self.user.username} (ID: {self.user.id})")
            await self.accept()
            
            # Envoyer une confirmation de connexion
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'user_id': self.user.id,
                'username': self.user.username
            }))
        else:
            print("Tentative de connexion WebSocket sans authentification")
            await self.close(code=4001)

    async def save_message(self, sender, recipient, content, timestamp=None):
        try:
            # Si timestamp n'est pas fourni, utiliser le timestamp actuel
            if timestamp is None:
                from django.utils import timezone
                timestamp = timezone.now()
            
            # Convertir recipient_id en instance User si nécessaire
            if isinstance(recipient, (int, str)):
                recipient = await self.get_user_by_id(int(recipient))
            
            if not recipient:
                raise ValueError("Recipient not found")
                
            # Créer et sauvegarder le message
            message = await self.create_message(
                sender=sender,
                recipient=recipient,
                content=content,
                timestamp=timestamp
            )
            
            return message
        except Exception as e:
            print(f"Erreur lors de l'enregistrement du message: {str(e)}")
            return None

    @database_sync_to_async
    def get_user_by_id(self, user_id):
        """
        Récupère un utilisateur par son ID
        """
        User = get_user_model()
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def create_message(self, sender, recipient, content, timestamp):
        """
        Crée un message dans la base de données
        """
        from chat.models import Message
        
        message = Message.objects.create(
            sender=sender,
            recipient=recipient,
            content=content,
            timestamp=timestamp
        )
        return message
        
    async def disconnect(self, close_code):
            # Quitter le groupe si l'utilisateur était authentifié
            if hasattr(self, 'user_group_name'):
                await self.channel_layer.group_discard(
                    self.user_group_name,
                    self.channel_name
                )
            print(f"WebSocket déconnecté, code: {close_code}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            print(f"Message reçu: {data}")
            
            message_type = data.get('type')
            
            if message_type == 'chat_message':
                recipient_id = data.get('recipient_id')
                message_content = data.get('message')
                timestamp = data.get('timestamp')
                
                if recipient_id:
                    # Sauvegarder le message dans la base de données
                    message = await self.save_message(
                        sender=self.user,  # Utilisez directement l'instance utilisateur
                        recipient=recipient_id,
                        content=message_content,
                        timestamp=timestamp
                    )
                    
                    if message:
                        # Envoyer au destinataire
                        await self.channel_layer.group_send(
                            f"user_{recipient_id}",
                            {
                                'type': 'chat_message',
                                'message': message_content,
                                'sender': self.user.username,
                                'sender_id': self.user.id,
                                'recipient_id': recipient_id,
                                'timestamp': timestamp
                            }
                        )
                        
                        # Confirmer à l'expéditeur
                        await self.send(text_data=json.dumps({
                            'type': 'message_sent',
                            'status': 'success',
                            'message': message_content,
                            'recipient_id': recipient_id,
                            'timestamp': timestamp
                        }))
                    else:
                        await self.send(text_data=json.dumps({
                            'type': 'error',
                            'message': 'Erreur lors de la sauvegarde du message'
                        }))
            
            elif message_type == 'connection_test':
                await self.send(text_data=json.dumps({
                    'type': 'connection_response',
                    'status': 'connected',
                    'message': 'Connection test successful'
                }))
                
        except Exception as e:
            print(f"Erreur dans receive: {str(e)}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))

    # Méthode pour envoyer un message de chat
    async def chat_message(self, event):
        # Envoyer le message au WebSocket
        await self.send(text_data=json.dumps(event))
    
    # Méthode pour les invitations de jeu
    async def game_invite(self, event):
        await self.send(text_data=json.dumps(event))

# Ajouter cette méthode à votre classe ChatConsumer

