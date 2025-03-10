# views.py
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib import messages
from .models import Message, UserProfile, GameInvite, Tournament
from django.db.models import Q
from django.contrib.auth.models import User
from django.contrib.auth import get_user_model
import json
from django.db import IntegrityError

User = get_user_model()

@login_required
def chat_view(request):
    try:
        user_profile = UserProfile.objects.get(user=request.user)
    except UserProfile.DoesNotExist:
        # Créez un UserProfile si celui-ci n'existe pas
        user_profile = UserProfile.objects.create(user=request.user)

    blocked_users = user_profile.blocked_users.all()
    
    # Obtenir également les utilisateurs qui ont bloqué l'utilisateur actuel
    blocked_by_users = User.objects.filter(userprofile__blocked_users=request.user)
    
    # Exclure à la fois les utilisateurs bloqués et ceux qui ont bloqué l'utilisateur actuel
    users = User.objects.exclude(id=request.user.id)\
        .exclude(id__in=blocked_users)\
        .exclude(id__in=blocked_by_users)
    
    messages = Message.objects.filter(
        (Q(sender=request.user) | Q(recipient=request.user)) &
        ~Q(sender__in=blocked_users) &
        ~Q(recipient__in=blocked_users) &
        ~Q(sender__in=blocked_by_users) &
        ~Q(recipient__in=blocked_by_users)
    ).order_by('timestamp')
    
    return render(request, 'chat/chat.html', {
        'messages': messages,
        'blocked_users': blocked_users,
        'users': users,
        'blocked_by_users': blocked_by_users 
    })

@login_required
def send_message(request):
    if request.method == 'POST':
        if request.content_type == 'application/json':
            data = json.loads(request.body)
            content = data.get('content')
            recipient_id = data.get('recipient_id')
        else:
            content = request.POST.get('content')
            recipient_id = request.POST.get('recipient_id')

        if not content or not recipient_id:
            return JsonResponse({'status': 'error', 'message': 'Missing data'}, status=400)

        try:
            recipient = User.objects.get(id=recipient_id)

            # Vérifier si l'utilisateur est bloqué par l'expéditeur
            if recipient in request.user.userprofile.blocked_users.all():
                return JsonResponse({
                    'status': 'error', 
                    'message': 'Impossible d\'envoyer un message à un utilisateur bloqué'
                }, status=403)
            
            # Vérifier si l'expéditeur est bloqué par le destinataire
            if request.user in recipient.userprofile.blocked_users.all():
                return JsonResponse({
                    'status': 'error', 
                    'message': 'Cet utilisateur vous a bloqué'
                }, status=403)

            # Créer le message en base de données
            Message.objects.create(
                sender=request.user,
                recipient=recipient,
                content=content,
                is_game_invite=False
            )
            return JsonResponse({'status': 'success'})
        
        except User.DoesNotExist:
            return JsonResponse({'status': 'error', 'message': 'User not found'}, status=404)

    return JsonResponse({'status': 'error', 'message': 'Invalid request'}, status=400)


@login_required
def get_user_messages(request, user_id):
    other_user = get_object_or_404(User, id=user_id)
    
    # Vérifier si l'un des utilisateurs a bloqué l'autre
    is_blocked = (
        other_user in request.user.userprofile.blocked_users.all() or
        request.user in other_user.userprofile.blocked_users.all()
    )
    
    if is_blocked:
        messages = []  # Retourner une liste vide si l'un des utilisateurs est bloqué
    else:
        messages = Message.objects.filter(
            (Q(sender=request.user, recipient_id=user_id) |
             Q(sender_id=user_id, recipient=request.user))
        ).order_by('timestamp')
    
    messages_data = [{
        'content': message.content,
        'sender': message.sender.username,
        'timestamp': message.timestamp.isoformat(),
        'recipient_id': message.recipient.id
    } for message in messages]
    
    return JsonResponse(messages_data, safe=False)

@login_required
def block_user(request, user_id):
    user_to_block = get_object_or_404(User, id=user_id)
    request.user.userprofile.blocked_users.add(user_to_block)
    return JsonResponse({'status': 'success'})

@login_required
def unblock_user(request, user_id):
    user_to_unblock = get_object_or_404(User, id=user_id)
    request.user.userprofile.blocked_users.remove(user_to_unblock)
    return JsonResponse({'status': 'success'})


@login_required
def send_game_invite(request, user_id):
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    
    recipient = get_object_or_404(User, id=user_id)

    # Vérifier si l'utilisateur est bloqué
    if recipient in request.user.userprofile.blocked_users.all():
        return JsonResponse({
            'status': 'error',
            'message': 'Vous ne pouvez pas envoyer d\'invitation à un utilisateur bloqué'
        })
    
    # Vérifier si l'utilisateur nous a bloqué
    if request.user in recipient.userprofile.blocked_users.all():
        return JsonResponse({
            'status': 'error',
            'message': 'Vous ne pouvez pas envoyer d\'invitation à cet utilisateur'
        })
    
    try:
        # Nettoyer les invitations expirées
        GameInvite.clean_expired_invites()
        
        # Vérifier si une invitation en attente existe déjà
        existing_invite = GameInvite.objects.filter(
            sender=request.user,
            recipient=recipient,
            status='pending'
        ).first()
        
        if existing_invite:
            if existing_invite.is_expired:
                existing_invite.delete()
            else:
                return JsonResponse({
                    'status': 'error',
                    'message': 'Une invitation est déjà en attente'
                })
            
        # Créer la nouvelle invitation
        invite = GameInvite.objects.create(
            sender=request.user,
            recipient=recipient,
            status='pending'
        )
        
        # Envoyer la notification via WebSocket
        channel_layer = get_channel_layer()
        try:
            async_to_sync(channel_layer.group_send)(
                f"user_{recipient.id}",
                {
                    "type": "game_invite",
                    "sender": request.user.username,
                    "sender_id": request.user.id,
                    "recipient_id": recipient.id,
                    "message": f"{request.user.username} vous invite à jouer"
                }
            )
            return JsonResponse({
                'status': 'success',
                'message': f'Invitation envoyée à {recipient.username}'
            })
        except Exception as ws_error:
            # Si l'envoi du message WebSocket échoue, on supprime l'invitation
            invite.delete()
            return JsonResponse({
                'status': 'error',
                'message': 'L\'utilisateur n\'est pas en ligne actuellement'
            })
    
    except Exception as e:
        print(f"Erreur lors de l'envoi de l'invitation: {str(e)}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        })

@login_required
def view_profile(request, user_id):
    profile = get_object_or_404(UserProfile, user_id=user_id)
    return render(request, 'chat/profile.html', {'profile': profile})


@login_required
def start_game(request, opponent_id):
    opponent = get_object_or_404(User, id=opponent_id)
    # Pour l'instant, redirigeons simplement vers la page d'accueil
    # Vous pourrez plus tard rediriger vers la vraie page de jeu
    messages.success(request, f"Démarrage d'une partie contre {opponent.username}")
    return redirect('home')

    # Quand vous aurez une page de jeu, vous pourrez utiliser :
    # return render(request, 'game/game.html', {
    #     'opponent': opponent,
    # })



@login_required
def accept_game_invite(request, sender_id):
    try:
        # Trouver l'invitation en attente
        invite = get_object_or_404(GameInvite, 
                                 sender_id=sender_id, 
                                 recipient=request.user, 
                                 status='pending')
        
        # Vérifier s'il existe déjà une invitation acceptée
        existing_accepted = GameInvite.objects.filter(
            sender_id=sender_id,
            recipient=request.user,
            status='accepted'
        ).first()
        
        if existing_accepted:
            # Si une invitation acceptée existe déjà, la supprimer
            existing_accepted.delete()
        
        # Mettre à jour le statut de l'invitation actuelle
        invite.status = 'accepted'
        invite.save()
        
        return JsonResponse({
            'status': 'success',
            'message': 'Invitation acceptée'
        })
        
    except Exception as e:
        print(f"Erreur lors de l'acceptation de l'invitation: {str(e)}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@login_required
def reject_game_invite(request, sender_id):
    try:
        # Trouver l'invitation en attente
        invite = get_object_or_404(GameInvite, 
                                 sender_id=sender_id, 
                                 recipient=request.user, 
                                 status='pending')
        
        # Vérifier s'il existe déjà une invitation rejetée
        existing_rejected = GameInvite.objects.filter(
            sender_id=sender_id,
            recipient=request.user,
            status='rejected'
        ).first()
        
        if existing_rejected:
            # Si une invitation rejetée existe déjà, la supprimer
            existing_rejected.delete()
        
        # Mettre à jour le statut de l'invitation actuelle
        invite.status = 'rejected'
        invite.save()
        
        return JsonResponse({
            'status': 'success',
            'message': 'Invitation rejetée'
        })
        
    except Exception as e:
        print(f"Erreur lors du rejet de l'invitation: {str(e)}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)
    
@login_required
def api_get_users(request):
    """
    Endpoint API qui renvoie les données des utilisateurs pour le chat SPA.
    """
    user_profile = UserProfile.objects.get_or_create(user=request.user)[0]
    
    # Obtenir les utilisateurs bloqués
    blocked_users = user_profile.blocked_users.all()
    
    # Obtenir les utilisateurs qui ont bloqué l'utilisateur actuel
    blocked_by_users = User.objects.filter(userprofile__blocked_users=request.user)
    
    # Obtenir tous les utilisateurs (sauf l'utilisateur actuel)
    all_users = User.objects.exclude(id=request.user.id)
    
    # Préparer les données JSON
    data = {
        'users': [
            {
                'id': user.id,
                'username': user.username,
                # Vous pouvez ajouter d'autres champs si nécessaire
            } for user in all_users
        ],
        'blocked_users': [
            {
                'id': user.id,
                'username': user.username,
            } for user in blocked_users
        ],
        'blocked_by_users': [user.id for user in blocked_by_users]  # Seulement les IDs pour vérification côté client
    }
    
    return JsonResponse(data)