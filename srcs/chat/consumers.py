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

    async def game_invite_response(self, event):
        """Méthode pour traiter les réponses aux invitations de jeu"""
        await self.send(text_data=json.dumps(event))

    async def game_start(self, event):
        """Méthode pour signaler le début d'une partie"""
        # S'assurer que toutes les informations importantes sont présentes
        await self.send(text_data=json.dumps({
            **event,
            'current_user': self.user.username,  # Ajout de l'utilisateur courant
            'current_user_id': self.user.id  # Ajout de l'ID de l'utilisateur courant
        }))
    
    async def send_game_start_message(self, recipient_id, game_id, opponent_name, sender_name, is_host=False):
        # Lorsque is_host est false, cela signifie que ce message est envoyé au destinataire
        # qui n'est PAS l'hôte. Dans ce cas, l'hôte est l'expéditeur (self.user)
        host_name = self.user.username if is_host else sender_name
        
        await self.channel_layer.group_send(
            f"user_{recipient_id}",
            {
                "type": "game_start",
                "game_id": game_id,
                "opponent": opponent_name,
                "is_host": is_host,
                "sender": self.user.username,
                "host_name": host_name  # Utiliser le nom correct de l'hôte
            }
        )

        await self.channel_layer.group_send(
            f"user_{self.user.id}",
            {
                'type': 'game_start',
                'game_id': game_id,
                'opponent': sender_name,
                'opponent_id': recipient_id,
                'is_host': False,
                'host_name': host_name  # Ajouter également ici pour cohérence
            }
        )
    
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

            elif message_type == 'game_invite_response':
                recipient_id = data.get('recipient_id')
                accepted = data.get('accepted', False)
 
                if recipient_id:
                    # Transmettre la réponse à l'expéditeur original de l'invitation
                    await self.channel_layer.group_send(
                        f"user_{recipient_id}",
                        {
                            'type': 'game_invite_response',
                            'sender': self.user.username,
                            'sender_id': self.user.id,
                            'recipient_id': recipient_id,
                            'accepted': accepted,
                            'is_host': data.get('is_host', False)
                        }
                    )
                    
                    # Si l'invitation est acceptée, rediriger les deux joueurs vers le jeu
                    if accepted:
                        # Générer un ID de partie unique
                        import uuid
                        game_id = str(uuid.uuid4())
                        
                        # Obtenir le nom de l'hôte (celui qui a envoyé l'invitation initiale)
                        host_user = await self.get_user_by_id(recipient_id)
                        host_name = host_user.username if host_user else "l'hôte"
                        
                        # Informer les deux joueurs du début de la partie
                        # Envoyer à l'hôte qui a fait l'invitation
                        await self.channel_layer.group_send(
                            f"user_{recipient_id}",
                            {
                                'type': 'game_start',
                                'game_id': game_id,
                                'opponent': self.user.username,
                                'opponent_id': self.user.id,
                                'is_host': True,
                                'host_name': host_name  # Utiliser le vrai nom de l'hôte
                            }
                        )
                        
                        # Envoyer au joueur qui a accepté l'invitation
                        await self.channel_layer.group_send(
                            f"user_{self.user.id}",
                            {
                                'type': 'game_start',
                                'game_id': game_id,
                                'opponent': host_name,
                                'opponent_id': recipient_id,
                                'is_host': False,
                                'host_name': host_name  # Utiliser le vrai nom de l'hôte
                            }
                        )
            
            elif message_type == 'game_invite':
                recipient_id = data.get('recipient_id')
                if recipient_id:
                    # Transmettre l'invitation au destinataire
                    await self.channel_layer.group_send(
                        f"user_{recipient_id}",
                        {
                            'type': 'game_invite',
                            'sender': self.user.username,
                            'sender_id': self.user.id,
                            'recipient_id': recipient_id,
                            'is_host': data.get('is_host', True)
                        }
                    )
                    
                    # Confirmer à l'expéditeur
                    await self.send(text_data=json.dumps({
                        'type': 'invite_sent',
                        'status': 'success',
                        'recipient_id': recipient_id
                    }))
                else:
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'ID du destinataire requis pour les invitations'
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