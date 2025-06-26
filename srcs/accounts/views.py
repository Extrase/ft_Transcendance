import json
import os
import requests
import secrets
import uuid
import random
from urllib.parse import urlencode
from django.utils.crypto import get_random_string

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.views import LoginView, PasswordChangeView, PasswordChangeDoneView
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import JsonResponse, HttpResponseRedirect, HttpResponse
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.views.generic import CreateView

from .forms import AchievementForm, LoginForm, SignupForm, UpdateUserForm
from .models import Profile, Achievement, Notification, GameStatistics, PlayerStats
from chat.models import Tournament, TournamentMatch, TournamentParticipant

User = get_user_model()

def get_profile_photo_url(user):
    """Fonction utilitaire pour obtenir l'URL de la photo de profil de manière sécurisée"""
    if user.profile_photo and hasattr(user.profile_photo, 'url'):
        try:
            # Vérifier si le fichier existe
            if os.path.exists(os.path.join(settings.MEDIA_ROOT, user.profile_photo.name)):
                return user.profile_photo.url
        except:
            pass
    return '/static/images/default_avatar.jpg'

# ==============================
# Vues d'authentification
# ==============================

@login_required
def get_user_id(request):
    return JsonResponse({'user_id': request.user.id})

class SignUpView(CreateView):
    form_class = UserCreationForm
    success_url = reverse_lazy("login")
    template_name = "registration/signup.html"

def login_view(request):
    # Si la demande est une requête AJAX, renvoyer une réponse JSON
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({"error": "Vous devez être connecté"}, status=401)
    
    # Sinon, rediriger vers la page d'accueil (qui affichera le formulaire de connexion)
    return redirect('/')

def login_page(request):
    form = LoginForm()
    if request.method == 'POST':
        form = LoginForm(request.POST)
        if form.is_valid():
            user = authenticate(
                username=form.cleaned_data['username'],
                password=form.cleaned_data['password'],
            )
            if user is not None:
                login(request, user)
                user.online = True
                user.save()
                messages.success(request, 'You are successfully logged in.')
                return redirect('home')
            else:
                messages.error(request, 'Invalid credentials.')
    return render(
        request, 'accounts/login.html', context={'form': form}
    )

@csrf_exempt
def api_login(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')

        user = authenticate(request, username=username, password=password)
        if user:
            user.online = True
            user.save()
            login(request, user)
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Invalid credentials'})

    return JsonResponse({'error': 'Invalid method'}, status=405)

@csrf_exempt
def logout_user(request):
    user = request.user
    if request.method == 'POST':
        user.online = False
        user.save()
        logout(request)
        return JsonResponse({'success': True, 'message': 'Déconnexion réussie'})
    return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

def api_check_auth(request):
    return JsonResponse({'is_authenticated': request.user.is_authenticated})

@csrf_exempt
@require_POST
def signup_view(request):
    username = request.POST.get('username')
    email = request.POST.get('email')
    first_name = request.POST.get('first_name')
    last_name = request.POST.get('last_name')
    password = request.POST.get('password')
    confirm_password = request.POST.get('confirm_password')
    avatar = request.FILES.get('profile_photo')

    if password != confirm_password:
        return JsonResponse({'detail': 'Les mots de passe ne correspondent pas.'}, status=400)

    if User.objects.filter(username=username).exists():
        return JsonResponse({'detail': 'Nom d\'utilisateur déjà pris.'}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password, first_name=first_name, last_name=last_name)

    create_user_directory(user)
    if avatar:
        user.profile_photo = avatar
        user.save()

    # Connecter l'utilisateur automatiquement après l'inscription
    login(request, user)
    user.online = True
    user.save()

    return JsonResponse({'detail': 'Inscription réussie !', 'redirect_url': reverse_lazy('login')}, status=201)

# ==============================
# Authentification OAuth 42
# ==============================

def generate_random_state():
    return secrets.token_urlsafe(32)

def initiate_42_auth(request):
    """Step 1: Redirect to 42 authorization"""
    state = generate_random_state()
    request.session['oauth_state'] = state

    auth_params = {
        'client_id': settings.FT_CLIENT_ID,
        'redirect_uri': settings.FT_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'public',
        'state': state
    }

    print(f"Redirect URI used: {settings.FT_REDIRECT_URI}")
    
    auth_url = f"{settings.AUTHORIZE_URL}?{urlencode(auth_params)}"
    return HttpResponseRedirect(auth_url)

def callback_view(request):
    print("Callback received with params:", request.GET)
    try:
        # Vérifier le state
        state = request.GET.get('state')
        stored_state = request.session.get('oauth_state')
        if not state or state != stored_state:
            # Gérer différemment selon le type de requête
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': False, 'error': 'Invalid state parameter'})
            else:
                messages.error(request, 'Erreur d\'authentification: état invalide')
                return redirect('/')

        # Récupérer le code d'autorisation
        code = request.GET.get('code')
        if not code:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'success': False, 'error': 'No code provided'})
            else:
                messages.error(request, 'Erreur d\'authentification: code manquant')
                return redirect('/')

        # Échanger le code contre un token d'accès
        token_response = requests.post(settings.TOKEN_URL, data={
            'grant_type': 'authorization_code',
            'client_id': settings.FT_CLIENT_ID,
            'client_secret': settings.FT_CLIENT_SECRET,
            'code': code,
            'redirect_uri': settings.FT_REDIRECT_URI
        })

        if not token_response.ok:
            return JsonResponse({'success': False, 'error': 'Failed to obtain access token'})

        token_data = token_response.json()
        access_token = token_data.get('access_token')

        # Récupérer les données de l'utilisateur
        user_data_response = requests.get(
            'https://api.intra.42.fr/v2/me',
            headers={'Authorization': f'Bearer {access_token}'}
        )

        if not user_data_response.ok:
            return JsonResponse({'success': False, 'error': 'Failed to fetch user data'})

        user_data = user_data_response.json()

        # Créer ou mettre à jour l'utilisateur
        user, created = User.objects.get_or_create(
            username=user_data['login'],
            defaults={
                'email': user_data['email'],
                'first_name': user_data.get('first_name', ''),
                'last_name': user_data.get('last_name', ''),
                'is_42_user': True,
                'intra_profile_url': user_data.get('url', '')
            }
        )

        if not created:
            # Mettre à jour les informations existantes
            user.email = user_data['email']
            user.first_name = user_data.get('first_name', '')
            user.last_name = user_data.get('last_name', '')
            user.is_42_user = True
            user.intra_profile_url = user_data.get('url', '')
            user.save()

        # Télécharger la photo de profil uniquement si elle n'existe pas déjà
        if 'image' in user_data:
            try:
                image_url = user_data['image'].get('link') or user_data['image'].get('url')
                if image_url:
                    # Delete old photo if exists
                    if user.profile_photo:
                        if os.path.exists(user.profile_photo.path):
                            os.remove(user.profile_photo.path)
                        user.profile_photo.delete()

                    # Download and save new photo
                    image_response = requests.get(image_url)
                    if image_response.ok:
                        image_name = f"users/avatars/avatar_{user.username}.jpg"
                        user.profile_photo.save(
                            image_name,
                            ContentFile(image_response.content),
                            save=True
                        )
                        print(f"Successfully saved profile photo for {user.username}")
                    else:
                        print(f"Failed to download image: {image_response.status_code}")
            except Exception as e:
                print(f"Error saving profile photo: {str(e)}")

        # Créer ou mettre à jour le profil
        Profile.objects.get_or_create(
            user=user,
            defaults={
                'level': 0,
                'games_played': 0,
                'win_rate': 0.0,
                'total_score': 0
            }
        )

        # Connecter l'utilisateur
        login(request, user)
        user.online = True
        user.save()
        user_directory = os.path.join(settings.MEDIA_ROOT, 'users', user.username)
        os.makedirs(user_directory, exist_ok=True)
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True, 
                'is_authenticated': True, 
                'username': user.username
            })
        else:
            # Pour les requêtes normales, redirection vers le profil
            return redirect('/profile')

    except Exception as e:
        print(f"Erreur dans callback_view: {str(e)}")
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'success': False, 'error': f'Authentication failed: {str(e)}'})
        else:
            messages.error(request, f'Erreur d\'authentification: {str(e)}')
            return redirect('/')
# ==============================
# Profil utilisateur
# ==============================

def serve_avatar(request, filename):
    """Sert directement les fichiers d'avatar"""
    filepath = os.path.join(settings.MEDIA_ROOT, 'users', 'avatars', filename)
    if os.path.exists(filepath):
        with open(filepath, 'rb') as f:
            return HttpResponse(f.read(), content_type='image/jpeg')
    return HttpResponse(status=404)

def create_user_directory(user):
    user_directory = os.path.join(settings.STATIC_ROOT, 'users', user.username)
    if not os.path.exists(user_directory):
        os.makedirs(user_directory)
        print(f"Dossier créé pour l'utilisateur : {user.username}")

@login_required
def profile_view(request):
    profile = request.user.profile

    if request.user.profile_photo and request.user.profile_photo.name:
        profile_photo_url = request.user.profile_photo.url
    else:
        profile_photo_url = '/static/images/default_avatar.jpg'

    # Récupérer les 5 dernières parties
    last_games = GameStatistics.objects.filter(player=request.user)\
                       .order_by('-date_played')[:5]
                       
    profile_data = {
        "is_authenticated": True,
        "username": request.user.username,
        "email": request.user.email,
        "profile_photo": profile_photo_url,
        "level": profile.level,
        "games_played": profile.games_played,
        "win_rate": profile.win_rate,
        "total_score": profile.total_score,
        "last_played_game": profile.last_played_game,
        "time_played": profile.time_played,
        "is_42_user": request.user.is_42_user,
        "online": request.user.online,
        "profile_gradient_start": profile.profile_gradient_start,
        "profile_gradient_end": profile.profile_gradient_end,
        "last_games": [
            {
                'date': game.date_played.isoformat(),
                'player_score': game.player_score,
                'opponent_score': game.computer_score,
                'opponent_name': game.opponent,
                'mode': 'Tournoi' if game.is_tournament_match else ('Multi' if game.is_multiplayer else 'Solo'),
                'win': game.player_score > game.computer_score,
                'is_perfect': game.is_perfect_game,
                'duration': game.duration,
                'is_tournament': game.is_tournament_match,
                'tournament_name': game.tournament_name,
                'tournament_round': game.tournament_round
            }
            for game in last_games
        ],
        "achievements": [
            {"name": achievement.name, "icon": achievement.icon}
            for achievement in profile.achievements.all()
        ],
        "friends": [
            {
                "username": friend.user.username,
                "online": friend.user.online,
                "profile_photo": friend.user.profile_photo.url if friend.user.profile_photo else '/static/images/default_avatar.jpg'
            }
            for friend in profile.friends.all()
        ],
        "notifications": [
            {
                "message": notification.message,
                "type": notification.type,
                "created_at": notification.created_at.strftime('%Y-%m-%d %H:%M:%S')
            }
            for notification in Notification.objects.filter(user=request.user).order_by('-created_at')[:5]
        ]
    }

    return JsonResponse(profile_data)

@login_required
def friend_profile_view(request, username):
    """Vue pour afficher le profil d'un ami"""
    try:
        friend_user = User.objects.get(username=username)
        friend_profile = Profile.objects.get(user=friend_user)
        
        # Vérifier si cet utilisateur est un ami
        if friend_profile not in request.user.profile.friends.all():
            return JsonResponse({
                'error': 'Vous n\'êtes pas autorisé à voir ce profil'
            }, status=403)
        
        # Préparer les données du profil de l'ami
        if friend_user.profile_photo and hasattr(friend_user.profile_photo, 'url'):
            profile_photo_url = get_profile_photo_url(friend_user)
        else:
            profile_photo_url = '/static/images/default_avatar.jpg'

        # Récupérer les 5 dernières parties (comme objets, pas comme dictionnaires)
        last_games = GameStatistics.objects.filter(player=friend_user)\
           .order_by('-date_played')[:5]
        
        profile_data = {
            "username": friend_user.username,
            "email": friend_user.email,
            "profile_photo": profile_photo_url,
            "level": friend_profile.level,
            "games_played": friend_profile.games_played,
            "win_rate": friend_profile.win_rate,
            "total_score": friend_profile.total_score,
            "last_played_game": friend_profile.last_played_game,
            "time_played": friend_profile.time_played,
            "is_42_user": friend_user.is_42_user,
            "online": friend_user.online,
            "profile_gradient_start": friend_profile.profile_gradient_start,
            "profile_gradient_end": friend_profile.profile_gradient_end,
            "last_games": [
            {
                'date': game.date_played.isoformat(),
                'player_score': game.player_score,
                'opponent_score': game.computer_score,
                'opponent_name': game.opponent,
                'mode': 'Tournoi' if game.is_tournament_match else ('Multi' if game.is_multiplayer else 'Solo'),
                'win': game.player_score > game.computer_score,
                'is_perfect': game.is_perfect_game,
                'duration': game.duration,
                'is_tournament': game.is_tournament_match,
                'tournament_name': game.tournament_name if hasattr(game, 'tournament_name') else None,
                'tournament_round': game.tournament_round if hasattr(game, 'tournament_round') else None
                }
            for game in last_games
        ],
            "achievements": [
                {"name": achievement.name, "icon": achievement.icon}
                for achievement in friend_profile.achievements.all()
            ],
        }
        
        return JsonResponse(profile_data)
    
    except User.DoesNotExist:
        return JsonResponse({'error': 'Utilisateur non trouvé'}, status=404)
    except Profile.DoesNotExist:
        return JsonResponse({'error': 'Profil non trouvé'}, status=404)
    except Exception as e:
        # Ajouter un log pour le débogage
        print(f"Erreur dans friend_profile_view: {str(e)}")
        return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)

@login_required
def get_user_data(request):
    user = request.user
    data = {
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'profile_photo': user.profile_photo.url if user.profile_photo else None,
    }
    return JsonResponse(data)

@login_required
@require_POST
def update_user(request):
    if request.user.is_42_user:
        return JsonResponse({
            'success': False,
            'detail': 'Les utilisateurs 42 ne sont pas autorisés à modifier leur profil.',
        }, status=403)

    try:
        old_avatar_path = None
        if request.user.profile_photo:
            old_avatar_path = request.user.profile_photo.path

        form = UpdateUserForm(request.POST, request.FILES, instance=request.user)

        if (form.data.get('username') != request.user.username and 
                User.objects.filter(username=form.data.get('username')).exists()):
                form.add_error('username', 'Ce nom d\'utilisateur est déjà pris.')
                return JsonResponse({
                    'success': False,
                    'detail': 'Ce nom d\'utilisateur est déjà pris.',
                    'errors': form.errors
                }, status=400)
        
        if (form.data.get('email') != request.user.email and 
                User.objects.filter(email=form.data.get('email')).exists()):
                form.add_error('email', 'Cet email d\'utilisateur est déjà pris.')
                return JsonResponse({
                    'success': False,
                    'detail': 'Cet email d\'utilisateur est déjà pris.',
                    'errors': form.errors
                }, status=400)
        
        if form.is_valid():
            form.save()

            # Si une nouvelle photo est envoyée ET qu'il y avait une ancienne photo
            if 'profile_photo' in request.FILES and old_avatar_path:
                if os.path.exists(old_avatar_path):
                    os.remove(old_avatar_path)

            return JsonResponse({
                'success': True,
                'detail': 'Vos informations ont été mises à jour avec succès.',
            }, status=200)
        else:
            return JsonResponse({
                'success': False,
                'detail': 'Formulaire invalide',
                'errors': form.errors
            }, status=400)

    except Exception as e:
        return JsonResponse({
            'success': False,
            'detail': f'Erreur lors de la mise à jour: {str(e)}'
        }, status=400)

@login_required
@require_POST
def delete_user(request):
    try:
        user = request.user
        
        # Obtenir le profil de l'utilisateur
        profile = user.profile
        
        # Supprimer cet utilisateur de la liste d'amis de tous les autres utilisateurs
        # qui l'ont comme ami
        profiles_with_user_as_friend = Profile.objects.filter(friends=profile)
        for other_profile in profiles_with_user_as_friend:
            other_profile.friends.remove(profile)
            # Optionnel: Notifier l'autre utilisateur
            Notification.objects.create(
                user=other_profile.user,
                message=f"L'utilisateur {user.username} a supprimé son compte",
                type="info"
            )
        
        # Supprimer la photo de profil si elle existe
        if user.profile_photo:
            if os.path.exists(user.profile_photo.path):
                os.remove(user.profile_photo.path)

        # Mettre l'utilisateur hors ligne avant de le supprimer
        user.online = False
        user.save()
        
        # Déconnecter l'utilisateur
        logout(request)
        
        # Supprimer le compte
        user.delete()
        
        return JsonResponse({
            'success': True,
            'detail': 'Compte supprimé avec succès.',
            'redirect': '/'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'detail': f'Erreur lors de la suppression: {str(e)}'
        }, status=400)

@login_required
def debug_profile_photo(request):
    """Vue de debug pour vérifier les chemins des photos de profil"""
    user = request.user
    media_file_path = None
    if user.profile_photo:
        media_file_path = os.path.join(settings.MEDIA_ROOT, user.profile_photo.name)
        exists = os.path.exists(media_file_path)
    else:
        exists = False

    return JsonResponse({
        'username': user.username,
        'profile_photo_name': user.profile_photo.name if user.profile_photo else None,
        'profile_photo_url': user.profile_photo.url if user.profile_photo else None,
        'profile_photo_path': media_file_path,
        'file_exists': exists,
        'media_root': settings.MEDIA_ROOT,
        'media_url': settings.MEDIA_URL,
        'is_42_user': user.is_42_user,
        'online': user.online,
    })

@csrf_exempt
def save_profile_colors(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        start_color = data.get('startColor')
        end_color = data.get('endColor')

        if request.user.is_authenticated:
            profile = request.user.profile
            profile.profile_gradient_start = start_color
            profile.profile_gradient_end = end_color
            profile.save()
            return JsonResponse({'success': True})

    return JsonResponse({'success': False})

class PasswordChangeAPIView(PasswordChangeView):
    success_url = reverse_lazy('password_change_done')

    def form_valid(self, form):
        super().form_valid(form)
        return JsonResponse({'success': True, 'redirect_url': self.success_url})

    def form_invalid(self, form):
        return JsonResponse({'success': False, 'errors': form.errors}, status=400)

class PasswordChangeDoneAPIView(PasswordChangeDoneView):
    def get(self, request, *args, **kwargs):
        return JsonResponse({'success': True, 'message': 'Password successfully changed.'})

# ==============================
# Achievements et amis
# ==============================

@login_required
def add_achievement(request):
    if request.method == 'POST':
        form = AchievementForm(request.POST)
        if form.is_valid():
            achievement = form.cleaned_data['achievement']
            user_profile = get_object_or_404(Profile, user=request.user)
            user_profile.achievements.add(achievement)
            messages.success(request, 'Achievement added successfully.')
            return redirect('profile')
    else:
        form = AchievementForm()
    return render(request, 'add_achievement.html', {'form': form})

# @login_required
# def add_friend(request, username):
#     try:
#         friend_user = User.objects.get(username=username)
#         friend_profile = Profile.objects.get(user=friend_user)
#         current_user_profile = Profile.objects.get(user=request.user)

#         if friend_profile not in current_user_profile.friends.all():
#             current_user_profile.friends.add(friend_profile)
#             messages.success(request, f'{username} has been added to your friends')
#         else:
#             messages.info(request, f'{username} is already in your friends list')

#     except User.DoesNotExist:
#         messages.error(request, 'User not found')
#     except Profile.DoesNotExist:
#         messages.error(request, 'Profile not found')

#     return redirect('profile')

@login_required
def add_friend(request, username):
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':  # Vérifie si c'est une requête AJAX
        # Vérifier si l'utilisateur essaie de s'ajouter lui-même
        if username == request.user.username:
            return JsonResponse({
                'status': 'error',
                'message': 'Vous ne pouvez pas vous ajouter vous-même en ami'
            }, status=400)

        try:
            # Récupérer l'utilisateur à ajouter comme ami
            friend_user = User.objects.get(username=username)
            friend_profile = Profile.objects.get(user=friend_user)
            
            # Récupérer le profil de l'utilisateur actuel
            current_user_profile = Profile.objects.get(user=request.user)

            # Vérifier si l'ami est déjà dans la liste d'amis
            if friend_profile not in current_user_profile.friends.all():
                # Ajout bidirectionnel: 
                # 1. Ajouter l'ami au profil de l'utilisateur actuel
                current_user_profile.friends.add(friend_profile)
                
                # 2. Ajouter également l'utilisateur actuel à la liste d'amis de l'ami
                friend_profile.friends.add(current_user_profile)
                
                # 3. Créer une notification pour l'ami
                Notification.objects.create(
                    user=friend_user,
                    message=f"{request.user.username} vous a ajouté comme ami",
                    type="info"
                )
                
                return JsonResponse({
                    'status': 'success',
                    'message': f'{username} a été ajouté à vos amis (et vous avez été ajouté à ses amis)'
                })
            else:
                return JsonResponse({
                    'status': 'info',
                    'message': f'{username} est déjà dans votre liste d\'amis'
                })

        except User.DoesNotExist:
            return JsonResponse({
                'status': 'error',
                'message': 'Utilisateur non trouvé'
            }, status=404)
        except Profile.DoesNotExist:
            return JsonResponse({
                'status': 'error',
                'message': 'Profil non trouvé'
            }, status=404)

    return JsonResponse({
        'status': 'error',
        'message': 'Requête invalide'
    }, status=400)

@login_required
def remove_friend(request, username):
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        try:
            friend_user = User.objects.get(username=username)
            friend_profile = Profile.objects.get(user=friend_user)
            current_user_profile = Profile.objects.get(user=request.user)

            if friend_profile in current_user_profile.friends.all():
                # Suppression bidirectionnelle:
                # 1. Supprimer l'ami de la liste d'amis de l'utilisateur actuel
                current_user_profile.friends.remove(friend_profile)
                
                # 2. Supprimer également l'utilisateur actuel de la liste d'amis de l'ami
                friend_profile.friends.remove(current_user_profile)
                
                # 3. Créer une notification pour l'ami
                Notification.objects.create(
                    user=friend_user,
                    message=f"{request.user.username} vous a retiré de ses amis",
                    type="info"
                )
                
                return JsonResponse({
                    'status': 'success',
                    'message': f'{username} a été retiré de vos amis (et vous avez été retiré de ses amis)'
                })
            else:
                return JsonResponse({
                    'status': 'error',
                    'message': f'{username} n\'est pas dans votre liste d\'amis'
                })

        except User.DoesNotExist:
            return JsonResponse({
                'status': 'error',
                'message': 'Utilisateur non trouvé'
            }, status=404)
        except Profile.DoesNotExist:
            return JsonResponse({
                'status': 'error',
                'message': 'Profil non trouvé'
            }, status=404)

    return JsonResponse({
        'status': 'error',
        'message': 'Requête invalide'
    }, status=400)

@login_required
def friends_status(request):
    profile = request.user.profile
    friends_data = [
        {
            "username": friend.user.username,
            "online": friend.user.online
        }
        for friend in profile.friends.all()
    ]
    print(f"API friends_status appelée, {len(friends_data)} amis trouvés") # Pour déboguer
    return JsonResponse({"friends": friends_data})

@login_required
def check_new_friends(request):
    """Vérifie si de nouveaux amis ont été ajoutés depuis la dernière requête"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            known_friends = data.get('known_friends', [])
            
            # Récupérer la liste actuelle d'amis
            profile = request.user.profile
            current_friends = [
                {
                    "username": friend.user.username,
                    "online": friend.user.online,
                    "profile_photo": get_profile_photo_url(friend.user)
                }
                for friend in profile.friends.all()
            ]
            
            # Identifier les nouveaux amis
            current_usernames = [friend["username"] for friend in current_friends]
            new_friends = [
                friend for friend in current_friends
                if friend["username"] not in known_friends
            ]
            
            return JsonResponse({
                "current_friends": current_usernames,
                "new_friends": new_friends
            })
            
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)

# @login_required
# def remove_friend(request, username):
#     if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
#         try:
#             # Récupérer l'utilisateur correspondant au nom d'utilisateur
#             friend_user = User.objects.get(username=username)
#             # Récupérer le profil de l'ami
#             friend_profile = Profile.objects.get(user=friend_user)
#             # Récupérer le profil de l'utilisateur actuel
#             current_user_profile = request.user.profile
#             # Supprimer l'ami de la liste d'amis
#             current_user_profile.friends.remove(friend_profile)
#             return JsonResponse({'success': True})
#         except User.DoesNotExist:
#             return JsonResponse({'success': False, 'error': 'User not found'})
#         except Profile.DoesNotExist:
#             return JsonResponse({'success': False, 'error': 'Profile not found'})
#     return JsonResponse({'success': False, 'error': 'Invalid request'})

@login_required
def get_notifications(request):
    notifications = request.user.notifications.all().order_by('-created_at')[:5]
    return JsonResponse({
        'notifications': [{
            'message': notif.message,
            'type': notif.type,
            'created_at': notif.created_at.strftime('%Y-%m-%d %H:%M')
        } for notif in notifications]
    })

# ==============================
# Jeux et statistiques
# ==============================

def index(request):
    """Page principale du jeu Pong"""
    return render(request, 'pong_app/index.html')

# Ajouter cette vue:

@login_required
@csrf_exempt
def save_game_stats(request):
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Méthode non autorisée'}, status=405)
    
    try:
        print("=== DÉMARRAGE SAVE_GAME_STATS ===")
        print(f"Utilisateur connecté: {request.user.username}, ID: {request.user.id}")
        
        data = json.loads(request.body)
        print(f"Données JSON reçues: {data}")
        
        # Détecter le mode de jeu
        is_multiplayer = 'player1' in data and 'player2' in data
        
        if is_multiplayer:
            return _handle_multiplayer_stats(data)
        else:
            return _handle_solo_stats(request.user, data)
            
    except Exception as e:
        print("=== ERREUR CRITIQUE DANS SAVE_GAME_STATS ===")
        print(f"Type d'erreur: {type(e).__name__}")
        print(f"Message d'erreur: {str(e)}")
        
        # Afficher le traceback complet
        import traceback
        traceback.print_exc()
        
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

def _handle_solo_stats(user, data):
    """Gère l'enregistrement des statistiques pour le mode solo"""
    player_score = data.get('player_score', 0)
    computer_score = data.get('computer_score', 0)
    difficulty = data.get('difficulty', 'md')
    duration = data.get('duration', 0)
    is_perfect = data.get('is_perfect', False)
    
    print(f"SOLO - Joueur: {user.username}")
    print(f"SOLO - Score: {player_score}-{computer_score}")
    print(f"SOLO - Difficulté: {difficulty}, Durée: {duration}, Parfait: {is_perfect}")
    
    # 1. Créer l'entrée GameStatistics
    GameStatistics.objects.create(
        player=user,
        opponent='AI',
        player_score=player_score,
        computer_score=computer_score,
        difficulty=difficulty,
        duration=duration,
        is_perfect_game=is_perfect,
        is_multiplayer=False,
        date_played=timezone.now()
    )
    
    # 2. Mettre à jour PlayerStats
    player_won = player_score > computer_score
    
    try:
        player_stats = PlayerStats.objects.get(player=user)
        player_stats.total_games += 1
        if player_won:
            player_stats.games_won += 1
        else:
            player_stats.games_lost += 1
        if is_perfect and player_won:
            player_stats.perfect_games += 1
            
        player_stats.win_ratio = _calculate_win_ratio(player_stats.games_won, player_stats.total_games)
        player_stats.save()
    except PlayerStats.DoesNotExist:
        PlayerStats.objects.create(
            player=user,
            total_games=1,
            games_won=1 if player_won else 0,
            games_lost=0 if player_won else 1,
            perfect_games=1 if is_perfect and player_won else 0,
            win_ratio=100 if player_won else 0
        )
    
    # 3. Mettre à jour le profil utilisateur
    _update_user_profile(user, player_score, duration, player_won, is_perfect)
    
    print("=== TRAITEMENT SOLO TERMINÉ AVEC SUCCÈS ===")
    return JsonResponse({'status': 'success', 'message': 'Statistiques solo enregistrées'})

def _handle_multiplayer_stats(data):
    """Gère l'enregistrement des statistiques pour le mode multijoueur"""
    player1_name = data.get('player1')
    player2_name = data.get('player2')
    player1_score = data.get('player1_score', 0)
    player2_score = data.get('player2_score', 0)
    winner = data.get('winner')
    duration = data.get('duration', 0)
    is_perfect = data.get('is_perfect', False)
    
    print(f"MULTIJOUEUR - Joueurs: {player1_name} vs {player2_name}")
    print(f"MULTIJOUEUR - Scores: {player1_score}-{player2_score}")
    print(f"MULTIJOUEUR - Gagnant: {winner}, Durée: {duration}, Parfait: {is_perfect}")
    
    try:
        # Récupérer les utilisateurs
        player1 = User.objects.get(username=player1_name)
        player2 = User.objects.get(username=player2_name)
        print(f"Utilisateurs trouvés: {player1.username} (ID: {player1.id}), {player2.username} (ID: {player2.id})")
        
        # Déterminer les résultats
        player1_won = player1_score > player2_score
        player2_won = player2_score > player1_score
        player1_perfect = is_perfect and player1_won
        player2_perfect = is_perfect and player2_won
        
        # 1. Créer les entrées GameStatistics
        gs1 = GameStatistics.objects.create(
            player=player1,
            opponent=player2.username,
            player_score=player1_score,
            computer_score=player2_score,
            difficulty='md',
            duration=duration,
            is_perfect_game=player1_perfect,
            is_multiplayer=True,
            date_played=timezone.now()
        )
        
        gs2 = GameStatistics.objects.create(
            player=player2,
            opponent=player1.username,
            player_score=player2_score,
            computer_score=player1_score,
            difficulty='md',
            duration=duration,
            is_perfect_game=player2_perfect,
            is_multiplayer=True,
            date_played=timezone.now()
        )
        
        print(f"GameStatistics créés: {gs1.id} et {gs2.id}")
        
        # 2. Mettre à jour PlayerStats pour les deux joueurs
        # Pour player1
        stats1 = _update_player_stats(player1, player1_won, player1_perfect)
        
        # Pour player2
        stats2 = _update_player_stats(player2, player2_won, player2_perfect)
        
        # 3. Mettre à jour les profils des deux joueurs
        _update_user_profile(player1, player1_score, duration, player1_won, player1_perfect, stats1.win_ratio)
        _update_user_profile(player2, player2_score, duration, player2_won, player2_perfect, stats2.win_ratio)
        
        print("=== TRAITEMENT MULTIJOUEUR TERMINÉ AVEC SUCCÈS ===")
        return JsonResponse({'status': 'success', 'message': 'Statistiques multijoueur enregistrées'})
        
    except User.DoesNotExist as e:
        print(f"ERREUR: Utilisateur non trouvé - {str(e)}")
        return JsonResponse({'status': 'error', 'message': 'Utilisateur non trouvé'}, status=404)

def _update_player_stats(user, won, is_perfect):
    """Mettre à jour les statistiques d'un joueur et retourner l'objet mis à jour"""
    try:
        stats = PlayerStats.objects.get(player=user)
        stats.total_games += 1
        if won:
            stats.games_won += 1
        else:
            stats.games_lost += 1
        if is_perfect:
            stats.perfect_games += 1
            
        stats.win_ratio = _calculate_win_ratio(stats.games_won, stats.total_games)
        stats.save()
        return stats
    except PlayerStats.DoesNotExist:
        stats = PlayerStats.objects.create(
            player=user,
            total_games=1,
            games_won=1 if won else 0,
            games_lost=0 if won else 1,
            perfect_games=1 if is_perfect else 0,
            win_ratio=100 if won else 0
        )
        return stats

def _update_user_profile(user, score, duration, won, is_perfect, win_ratio=None):
    """Mettre à jour le profil de l'utilisateur avec toutes les données pertinentes"""
    profile = user.profile
    profile.games_played += 1
    profile.last_played_game = 'Pong'
    profile.total_score += score
    profile.time_played += duration / 60  # Convertir en minutes
    
    # Utiliser le ratio fourni ou calculer à partir des PlayerStats
    if win_ratio is None:
        try:
            player_stats = PlayerStats.objects.get(player=user)
            profile.win_rate = player_stats.win_ratio
        except PlayerStats.DoesNotExist:
            profile.win_rate = 100 if won else 0
    else:
        profile.win_rate = win_ratio
    
    # Calculer le niveau
    profile.level = min(99, profile.games_played // 5 + 1)
    
    # Gérer les achievements
    _update_achievements(user, profile, is_perfect)
    
    # Sauvegarder le profil
    profile.save()
    print(f"Profil mis à jour pour {user.username}: parties={profile.games_played}, niveau={profile.level}, victoires={profile.win_rate}%")
    return profile

def _update_achievements(user, profile, is_perfect):
    """Mettre à jour les achievements de l'utilisateur"""
    # Achievement pour partie parfaite
    if is_perfect:
        perfect_achievement, created = Achievement.objects.get_or_create(
            name="Partie Parfaite", 
            defaults={"icon": "fas fa-crown"}
        )
        profile.achievements.add(perfect_achievement)
    
    # Achievements basés sur le nombre de parties
    if profile.games_played >= 10:
        regular_player, created = Achievement.objects.get_or_create(
            name="Joueur Régulier",
            defaults={"icon": "fas fa-gamepad"}
        )
        profile.achievements.add(regular_player)
    
    if profile.games_played >= 50:
        veteran_player, created = Achievement.objects.get_or_create(
            name="Vétéran",
            defaults={"icon": "fas fa-medal"}
        )
        profile.achievements.add(veteran_player)

def _calculate_win_ratio(wins, total):
    """Calculer le ratio de victoires"""
    return (wins / total if total > 0 else 0) * 100

@login_required
def get_combined_profile_stats(request):
    """API pour récupérer les statistiques combinées du profil et du jeu Pong"""
    profile = request.user.profile

    try:
        pong_stats = PlayerStats.objects.get(player=request.user)
    except PlayerStats.DoesNotExist:
        pong_stats = None

    # Récupérer les 5 dernières parties de Pong
    recent_games = GameStatistics.objects.filter(player=request.user).order_by('-date_played')[:5]
    recent_games_data = []

    for game in recent_games:
        recent_games_data.append({
            'date': game.date_played.strftime('%d/%m/%Y'),
            'player_score': game.player_score,
            'computer_score': game.computer_score,
            'difficulty': game.get_difficulty_display(),
            'result': 'Victoire' if game.player_score > game.computer_score else 'Défaite',
            'perfect': game.is_perfect_game
        })

    # Construire les données combinées
    profile_data = {
        "username": request.user.username,
        "email": request.user.email,
        "profile_photo": get_profile_photo_url(request.user),
        "level": profile.level,
        "games_played": profile.games_played,
        "win_rate": profile.win_rate,
        "total_score": profile.total_score,
        "last_played_game": profile.last_played_game,
        "time_played": profile.time_played,
        "is_42_user": request.user.is_42_user,
        "online": request.user.online,
        "profile_gradient_start": profile.profile_gradient_start,
        "profile_gradient_end": profile.profile_gradient_end,
        "achievements": [
            {"name": achievement.name, "icon": achievement.icon}
            for achievement in profile.achievements.all()
        ],
        "pong_stats": {
            "total_games": pong_stats.total_games if pong_stats else 0,
            "games_won": pong_stats.games_won if pong_stats else 0,
            "games_lost": pong_stats.games_lost if pong_stats else 0,
            "perfect_games": pong_stats.perfect_games if pong_stats else 0,
            "win_ratio": pong_stats.win_ratio if pong_stats else 0,
            "recent_games": recent_games_data
        }
    }

    return JsonResponse(profile_data)

@login_required
def get_player_stats(request):
    """API pour récupérer les statistiques du joueur"""
    try:
        player_stats = PlayerStats.objects.get(player=request.user)

        # Récupérer les 5 dernières parties
        recent_games = GameStatistics.objects.filter(player=request.user)[:5]
        recent_games_data = []

        for game in recent_games:
            recent_games_data.append({
                'date': game.date_played.strftime('%d/%m/%Y'),
                'player_score': game.player_score,
                'computer_score': game.computer_score,
                'difficulty': game.difficulty
            })

        return JsonResponse({
            'total_games': player_stats.total_games,
            'games_won': player_stats.games_won,
            'games_lost': player_stats.games_lost,
            'perfect_games': player_stats.perfect_games,
            'win_ratio': player_stats.win_ratio,
            'recent_games': recent_games_data
        })
    except PlayerStats.DoesNotExist:
        return JsonResponse({
            'total_games': 0,
            'games_won': 0,
            'games_lost': 0,
            'perfect_games': 0,
            'win_ratio': 0,
            'recent_games': []
        })

# ==============================
# Pages principales
# ==============================

def home(request):
    return render(request, 'home.html')

def api_home(request):
    """Retourne les données de la page d'accueil pour la SPA avec les vraies infos utilisateur."""
    if request.user.is_authenticated:
        # Récupérer le profil lié à l'utilisateur
        profile = request.user.profile

        if request.user.profile_photo and hasattr(request.user.profile_photo, 'url'):
            profile_photo_url = request.user.profile_photo.url
        else:
            profile_photo_url = '/static/images/default_avatar.jpg'

        # Construire le profil utilisateur à partir des données réelles
        user_profile = {
            "games_played": profile.games_played,
            "win_rate": profile.win_rate,
            "level": profile.level,
            "total_score": profile.total_score,
            "last_played_game": profile.last_played_game,
            "time_played": profile.time_played,
            "achievements": [achievement.name for achievement in profile.achievements.all()]
        }

        # Simuler les jeux populaires
        featured_games = [
            {"title": "Pong", "image": "/static/images/game1.jpg", "url": "/pong"},
            {"title": "Pong Improved", "image": "/static/images/game2.jpg", "url": "/pong-ameliore"},
            {"title": "Bomberman", "image": "/static/images/game3.jpg", "url": "/Bomberman"}
        ]

        # Activité récente basée sur les notifications
        recent_activity = [
            f"{notif.user.username} - {notif.message}"
            for notif in Notification.objects.filter(user=request.user).order_by('-created_at')[:5]
        ]

        # Données à retourner
        data = {
            "is_authenticated": True,
            "username": request.user.username,
            "profile_photo": profile_photo_url,  # Photo de profil
            "user_profile": user_profile,
            "featured_games": featured_games,
            "recent_activity": recent_activity
        }
        return JsonResponse(data)
    else:
        # Si l'utilisateur n'est pas connecté
        data = {
            "is_authenticated": False,
            "message": "You are not logged in. Log in here."
        }
        return JsonResponse(data)
    
@login_required
def create_tournament(request):
    """API pour créer un nouveau tournoi"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            name = data.get('name')
            max_participants = int(data.get('max_participants', 8))
            creator_alias = data.get('creator_alias', '').strip()
            
            # Validation
            if not name:
                return JsonResponse({'status': 'error', 'message': 'Le nom du tournoi est obligatoire'}, status=400)
            
            # Validation de l'alias (maintenant obligatoire)
            if not creator_alias:
                return JsonResponse({'status': 'error', 'message': 'Un alias est obligatoire pour participer au tournoi'}, status=400)
      
            # Créer le tournoi
            tournament = Tournament.objects.create(
                name=name,
                creator=request.user,
                max_participants=max_participants
            )
            
            # Inscrire le créateur automatiquement
            TournamentParticipant.objects.create(
                tournament=tournament,
                user=request.user,
                alias=creator_alias
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Tournoi créé avec succès',
                'tournament': {
                    'id': tournament.id,
                    'name': tournament.name
                }
            })
            
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    
    return JsonResponse({'status': 'error', 'message': 'Méthode non autorisée'}, status=405)

@login_required
def list_tournaments(request):
    """Liste tous les tournois"""
    active_tournaments = Tournament.objects.filter(is_active=True, is_completed=False)
    my_tournaments = Tournament.objects.filter(participants__user=request.user).distinct()
    completed_tournaments = Tournament.objects.filter(is_completed=True)
    
    def format_tournament(tournament):
        return {
            'id': tournament.id,
            'name': tournament.name,
            'creator': tournament.creator.username,
            'start_date': tournament.start_date.strftime('%Y-%m-%d %H:%M'),
            'participants_count': tournament.participants.count(),
            'max_participants': tournament.max_participants,
            'is_completed': tournament.is_completed,
            'winner': tournament.winner.username if tournament.winner else None,
            'current_round': tournament.current_round,
            'is_registration_open': tournament.is_registration_open(),
            'is_creator': tournament.creator == request.user,
            'am_i_participant': tournament.participants.filter(user=request.user).exists()
        }
    
    return JsonResponse({
        'active_tournaments': [format_tournament(t) for t in active_tournaments],
        'my_tournaments': [format_tournament(t) for t in my_tournaments],
        'completed_tournaments': [format_tournament(t) for t in completed_tournaments]
    })

@login_required
def tournament_detail(request, tournament_id):
    """Détails d'un tournoi spécifique"""
    try:
        print(f"\n=== DÉBUT TOURNAMENT_DETAIL ===")
        print(f"Tournament ID reçu: {tournament_id}")
        print(f"Utilisateur connecté: {request.user.username}")
        
        tournament = Tournament.objects.get(id=tournament_id)
        print(f"Tournoi trouvé: {tournament.name} (ID: {tournament.id})")
        print(f"Créateur: {tournament.creator.username}")
        print(f"Statut: actif={tournament.is_active}, terminé={tournament.is_completed}")
        print(f"Nombre de participants: {tournament.participants.count()}")
        print(f"Nombre de matchs: {tournament.matches.count()}")
        
        participants = [{
            'username': p.user.username,
            'alias': p.alias,
            'display_name': p.alias or p.user.username,
            'profile_photo': get_profile_photo_url(p.user),
            'joined_at': p.joined_at.strftime('%Y-%m-%d %H:%M'),
            'is_bot': p.is_bot
        } for p in tournament.participants.all()]
        
        print(f"\nListe des participants ({len(participants)}):")
        for p in participants:
            print(f"- {p['username']} (alias: {p['alias']}, bot: {p['is_bot']})")
        
        matches = []
        print(f"\nTraitement des matchs:")
        for match in tournament.matches.all():
            print(f"\nMatch ID: {match.id}")
            print(f"Round: {match.round}")
            print(f"Joueur 1: {match.player1.username}")
            print(f"Joueur 2: {match.player2.username}")
            print(f"Terminé: {match.is_completed}")
            print(f"Scores: {match.player1_score}-{match.player2_score}")
            
            player1_participant = tournament.participants.filter(user=match.player1).first()
            player2_participant = tournament.participants.filter(user=match.player2).first()
            
            print(f"Participant 1 trouvé: {player1_participant is not None}")
            print(f"Participant 2 trouvé: {player2_participant is not None}")
            
            player1_is_bot = player1_participant.is_bot if player1_participant else False
            player2_is_bot = player2_participant.is_bot if player2_participant else False
            
            print(f"Joueur 1 est bot: {player1_is_bot}")
            print(f"Joueur 2 est bot: {player2_is_bot}")
            
            player1_alias = player1_participant.alias if player1_participant else None
            player2_alias = player2_participant.alias if player2_participant else None
            
            print(f"Alias joueur 1: {player1_alias}")
            print(f"Alias joueur 2: {player2_alias}")
            
            can_play = not match.is_completed and \
                       (match.player1 == request.user or match.player2 == request.user) and \
                       not (player1_is_bot and player2_is_bot)
            
            print(f"L'utilisateur peut jouer: {can_play}")
            
            match_data = {
                'id': match.id,
                'round': match.round,
                'player1': {
                    'username': match.player1.username,
                    'alias': player1_alias,
                    'display_name': player1_alias or match.player1.username,
                    'profile_photo': get_profile_photo_url(match.player1),
                    'is_bot': player1_is_bot
                },
                'player2': {
                    'username': match.player2.username,
                    'alias': player2_alias,
                    'display_name': player2_alias or match.player2.username,
                    'profile_photo': get_profile_photo_url(match.player2),
                    'is_bot': player2_is_bot
                },
                'is_completed': match.is_completed,
                'player1_score': match.player1_score,
                'player2_score': match.player2_score,
                'winner': match.winner.username if match.winner else None,
                'played_at': match.played_at.strftime('%Y-%m-%d %H:%M') if match.played_at else None,
                'can_play': can_play
            }
            matches.append(match_data)
        
        print(f"\nPréparation de la réponse:")
        response_data = {
            'tournament': {
                'id': tournament.id,
                'name': tournament.name,
                'creator': {
                    'username': tournament.creator.username,
                    'profile_photo': get_profile_photo_url(tournament.creator)
                },
                'start_date': tournament.start_date.strftime('%Y-%m-%d %H:%M'),
                'max_participants': tournament.max_participants,
                'is_active': tournament.is_active,
                'is_completed': tournament.is_completed,
                'winner': tournament.winner.username if tournament.winner else None,
                'current_round': tournament.current_round,
                'is_registration_open': tournament.is_registration_open(),
                'am_i_participant': tournament.participants.filter(user=request.user).exists(),
                'am_i_creator': tournament.creator == request.user
            },
            'participants': participants,
            'matches': matches
        }
        
        print(f"\n=== FIN TOURNAMENT_DETAIL ===")
        return JsonResponse(response_data)
        
    except Tournament.DoesNotExist:
        print(f"\nERREUR: Tournoi non trouvé (ID: {tournament_id})")
        return JsonResponse({'status': 'error', 'message': 'Tournoi non trouvé'}, status=404)
    except Exception as e:
        print(f"\nERREUR CRITIQUE dans tournament_detail:")
        print(f"Type d'erreur: {type(e).__name__}")
        print(f"Message d'erreur: {str(e)}")
        import traceback
        print("Traceback complet:")
        print(traceback.format_exc())
        return JsonResponse({'error': str(e)}, status=500)

@login_required
def join_tournament(request, tournament_id):
    """API pour rejoindre un tournoi"""
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Méthode non autorisée'}, status=405)
        
    try:
        tournament = Tournament.objects.get(id=tournament_id)
        
        if tournament.participants.filter(user=request.user).exists():
            return JsonResponse({'status': 'error', 'message': 'Vous participez déjà à ce tournoi'}, status=400)
            
        if not tournament.is_registration_open():
            return JsonResponse({'status': 'error', 'message': 'Les inscriptions pour ce tournoi sont fermées'}, status=400)

        # Récupérer l'alias depuis le corps de la requête
        data = json.loads(request.body)
        alias = data.get('alias', '').strip()

         # Vérifier que l'alias n'est pas vide (maintenant obligatoire)
        if not alias:
            return JsonResponse({'status': 'error', 'message': 'Un alias est obligatoire pour participer au tournoi'}, status=400)
        
        # Vérifier si l'alias existe déjà dans ce tournoi
        if alias and tournament.participants.filter(alias=alias).exists():
            return JsonResponse({'status': 'error', 'message': 'Cet alias est déjà utilisé dans ce tournoi'}, status=400)

        TournamentParticipant.objects.create(
            tournament=tournament,
            user=request.user,
            alias=alias  # Utiliser None si l'alias est vide
        )
        
        # Notification au créateur du tournoi
        Notification.objects.create(
            user=tournament.creator,
            message=f"{request.user.username} a rejoint votre tournoi '{tournament.name}'",
            type="info"
        )
        
        return JsonResponse({
            'status': 'success', 
            'message': f'Vous avez rejoint le tournoi {tournament.name}',
            'tournament_id': tournament_id
        })
    
    except Tournament.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Tournoi non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@login_required
def leave_tournament(request, tournament_id):
    """API pour quitter un tournoi"""
    try:
        tournament = Tournament.objects.get(id=tournament_id)
        
        if not tournament.participants.filter(user=request.user).exists():
            return JsonResponse({'status': 'error', 'message': 'Vous ne participez pas à ce tournoi'}, status=400)
            
        if TournamentMatch.objects.filter(tournament=tournament).exists():
            return JsonResponse({'status': 'error', 'message': 'Vous ne pouvez pas quitter un tournoi qui a déjà commencé'}, status=400)
        
        tournament.participants.filter(user=request.user).delete()
        
        return JsonResponse({'status': 'success', 'message': f'Vous avez quitté le tournoi {tournament.name}'})
    
    except Tournament.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Tournoi non trouvé'}, status=404)

@login_required
def start_tournament(request, tournament_id):
    """API pour démarrer un tournoi"""
    try:
        tournament = Tournament.objects.get(id=tournament_id)
        
        if not tournament.is_active:
            return JsonResponse({'status': 'error', 'message': 'Ce tournoi n\'est pas actif'}, status=400)
            
        if tournament.is_completed:
            return JsonResponse({'status': 'error', 'message': 'Ce tournoi est déjà terminé'}, status=400)
            
        if tournament.creator != request.user:
            return JsonResponse({'status': 'error', 'message': 'Seul le créateur du tournoi peut le démarrer'}, status=403)
        
        # Vérifier le nombre minimum de participants
        participants_count = tournament.participants.count()
        if participants_count < 2:
            return JsonResponse({'status': 'error', 'message': 'Il faut au moins 2 participants pour démarrer un tournoi'}, status=400)
        
        # Si le nombre de participants est inférieur au maximum, ajouter des bots
        if participants_count < tournament.max_participants:
            # Créer des utilisateurs bots
            bots_needed = tournament.max_participants - participants_count
            create_tournament_bots(tournament, bots_needed)
        
        # Générer les matchs du premier tour
        generate_tournament_matches(tournament)
        
        # Jouer automatiquement les matchs entre bots
        play_bot_matches(tournament)
        
        # Mettre à jour le statut du tournoi
        tournament.current_round = 1
        tournament.save()
        
        return JsonResponse({
            'status': 'success', 
            'message': 'Tournoi démarré avec succès',
            'tournament_id': tournament_id
        })
    
    except Tournament.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Tournoi non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

def create_tournament_bots(tournament, count):
    """Crée le nombre spécifié de bots pour un tournoi"""
    for i in range(count):
        bot_name = f"Bot_{i+1}_{tournament.id}"
        
        # Vérifier si un utilisateur avec ce nom existe déjà
        try:
            bot_user = User.objects.get(username=bot_name)
        except User.DoesNotExist:
            # Créer un nouvel utilisateur bot
            bot_user = User.objects.create_user(
                username=bot_name,
                password=get_random_string(12),
                email=f"bot{i+1}_{tournament.id}@example.com",
                first_name="Bot",
                last_name=f"Player {i+1}"
            )
            bot_user.is_bot = True
            bot_user.save()
        
        # Ajouter le bot comme participant au tournoi
        participant, created = TournamentParticipant.objects.get_or_create(
            tournament=tournament,
            user=bot_user,
            defaults={'is_bot': True}
        )
        
        if created:
            print(f"Bot {bot_name} ajouté au tournoi {tournament.id}")

def generate_tournament_matches(tournament):
    """Génère les matchs du premier tour d'un tournoi"""
    # Récupérer tous les participants
    participants = list(tournament.participants.all())
    
    # Mélanger la liste des participants
    random.shuffle(participants)
    
    # Créer les matchs du premier tour
    for i in range(0, len(participants), 2):
        if i + 1 < len(participants):
            TournamentMatch.objects.create(
                tournament=tournament,
                player1=participants[i].user,
                player2=participants[i+1].user,
                round=1
            )

def play_bot_matches(tournament):
    """Joue automatiquement les matchs entre bots et marque les matchs humain-bot comme jouables"""
    # Récupérer tous les matchs non terminés du tournoi
    matches = TournamentMatch.objects.filter(tournament=tournament, is_completed=False)
    
    for match in matches:
        try:
            # Vérifier si les joueurs sont des bots
            player1_participant = TournamentParticipant.objects.get(tournament=tournament, user=match.player1)
            player2_participant = TournamentParticipant.objects.get(tournament=tournament, user=match.player2)
            
            player1_is_bot = player1_participant.is_bot
            player2_is_bot = player2_participant.is_bot
            
            # Si les deux joueurs sont des bots, jouer le match automatiquement
            if player1_is_bot and player2_is_bot:
                # Choix d'un gagnant aléatoire
                winner_bot = random.choice([match.player1, match.player2])
                loser_bot = match.player2 if winner_bot == match.player1 else match.player1
                
                # Le gagnant a toujours 3 points, le perdant un score aléatoire entre 0 et 2
                if winner_bot == match.player1:
                    player1_score = 3
                    player2_score = random.randint(0, 2)
                else:
                    player1_score = random.randint(0, 2)
                    player2_score = 3
                
                # Mettre à jour le match
                match.player1_score = player1_score
                match.player2_score = player2_score
                match.is_completed = True
                match.played_at = timezone.now()
                match.winner = winner_bot
                match.save()
                
                print(f"Match bot vs bot {match.id}: {match.player1.username} ({player1_score}) vs {match.player2.username} ({player2_score})")
        except TournamentParticipant.DoesNotExist as e:
            print(f"Erreur: Participant introuvable - {e}")
            continue
    
    # Vérifier si le tour actuel est terminé et avancer le tournoi si nécessaire
    check_round_completion(tournament)

def check_round_completion(tournament):
    """Vérifie si un tour est terminé et passe au suivant si c'est le cas"""
    current_round = tournament.current_round
    matches = TournamentMatch.objects.filter(tournament=tournament, round=current_round)
    
    # Si tous les matchs du tour actuel sont terminés
    if matches.filter(is_completed=True).count() == matches.count():
        winners = [match.winner for match in matches]
        
        if len(winners) >= 2:
            # Créer le prochain tour
            next_round = current_round + 1
            tournament.current_round = next_round
            tournament.save()
            
            # Mélanger les gagnants pour éviter les même face-à-face
            random.shuffle(winners)
            
            # Créer les matchs du prochain tour
            for i in range(0, len(winners), 2):
                if i + 1 < len(winners):
                    match = TournamentMatch.objects.create(
                        tournament=tournament,
                        player1=winners[i],
                        player2=winners[i+1],
                        round=next_round
                    )
                    
                    # Vérifier si ce match est entre bots
                    player1_is_bot = TournamentParticipant.objects.get(tournament=tournament, user=match.player1).is_bot
                    player2_is_bot = TournamentParticipant.objects.get(tournament=tournament, user=match.player2).is_bot
                    
                    if player1_is_bot and player2_is_bot:
                        # Choix d'un gagnant aléatoire
                        winner_bot = random.choice([match.player1, match.player2])
                        
                        # Le gagnant a toujours 3 points, le perdant un score aléatoire entre 0 et 2
                        if winner_bot == match.player1:
                            player1_score = 3
                            player2_score = random.randint(0, 2)
                        else:
                            player1_score = random.randint(0, 2)
                            player2_score = 3
                        
                        match.player1_score = player1_score
                        match.player2_score = player2_score
                        match.is_completed = True
                        match.played_at = timezone.now()
                        match.winner = winner_bot
                        match.save()
                        
                        # Vérifier à nouveau si ce tour est terminé
                        check_round_completion(tournament)
        else:
            # S'il n'y a qu'un seul gagnant, le tournoi est terminé
            tournament.is_completed = True
            tournament.winner = winners[0] if winners else None
            tournament.save()
            
            # Créer une notification pour le gagnant
            if tournament.winner:
                Notification.objects.create(
                    user=tournament.winner,
                    message=f"Félicitations ! Vous avez remporté le tournoi '{tournament.name}'",
                    type="success"
                )
            # delete_tournament_bots(tournament)

def delete_tournament_bots(tournament):
    """Supprime tous les bots qui ont participé à un tournoi"""
    # Identifier tous les bots utilisés dans ce tournoi
    bot_participants = TournamentParticipant.objects.filter(tournament=tournament, is_bot=True)
    
    for bot_participant in bot_participants:
        bot_user = bot_participant.user
        
        # Vérifier si le bot n'est pas utilisé dans d'autres tournois actifs
        other_participations = TournamentParticipant.objects.filter(
            user=bot_user,
            tournament__is_completed=False
        ).exclude(tournament=tournament).count()
        
        if other_participations == 0:
            try:
                # Supprimer le bot s'il n'est pas utilisé ailleurs
                print(f"Suppression du bot {bot_user.username} du tournoi {tournament.id}")
                
                # Supprimer d'abord toutes les participations
                TournamentParticipant.objects.filter(user=bot_user).delete()
                
                # Supprimer tous les matchs liés à ce bot
                # Note: Cette étape est optionnelle car les matchs restent importants pour l'historique
                # TournamentMatch.objects.filter(Q(player1=bot_user) | Q(player2=bot_user)).delete()
                
                # Supprimer le bot lui-même
                bot_user.delete()
                
            except Exception as e:
                print(f"Erreur lors de la suppression du bot {bot_user.username}: {str(e)}")

@login_required
def play_tournament_match(request, match_id):
    """API pour commencer un match de tournoi"""
    try:
        match = TournamentMatch.objects.get(id=match_id)

        # Obtenir les alias des participants
        player1_participant = TournamentParticipant.objects.get(tournament=match.tournament, user=match.player1)
        player2_participant = TournamentParticipant.objects.get(tournament=match.tournament, user=match.player2)
        
        player1_alias = player1_participant.alias or match.player1.username
        player2_alias = player2_participant.alias or match.player2.username
        
        if match.is_completed:
            return JsonResponse({'status': 'error', 'message': 'Ce match est déjà terminé'}, status=400)
            
        # Vérifier si l'utilisateur est l'un des joueurs
        if request.user != match.player1 and request.user != match.player2:
            return JsonResponse({'status': 'error', 'message': 'Vous n\'êtes pas un joueur de ce match'}, status=403)
        
        # Obtenir des informations sur le statut "bot" des joueurs
        tournament = match.tournament
        player1_is_bot = TournamentParticipant.objects.filter(tournament=tournament, user=match.player1, is_bot=True).exists()
        player2_is_bot = TournamentParticipant.objects.filter(tournament=tournament, user=match.player2, is_bot=True).exists()
        
        # Si les deux joueurs sont des bots, ne pas autoriser le jeu
        if player1_is_bot and player2_is_bot:
            return JsonResponse({'status': 'error', 'message': 'Les matchs entre bots sont joués automatiquement'}, status=400)
        
        # Si c'est un match humain vs bot, rediriger vers un jeu solo
        if player1_is_bot or player2_is_bot:
            # Déterminer qui est le joueur humain et qui est le bot
            human_player = match.player2 if player1_is_bot else match.player1
            bot_player = match.player1 if player1_is_bot else match.player2

            # Récupérer l'objet participant du joueur humain pour accéder à son alias
            human_participant = player2_participant if player1_is_bot else player1_participant
            human_player_alias = human_participant.alias or human_player.username
            
            # Vérifier que l'utilisateur connecté est bien le joueur humain
            if request.user != human_player:
                return JsonResponse({'status': 'error', 'message': 'Vous n\'êtes pas le joueur humain de ce match'}, status=403)
            
            # Rediriger vers le jeu Pong en mode solo contre un bot
            return JsonResponse({
                'status': 'success', 
                'redirect_url': f'/pong?mode=solo&difficulty=md&tournament_id={match.tournament.id}&match_id={match.id}&vs_bot=true&bot_name={bot_player.username}&player1={human_player.username}&player1_alias={human_player_alias}'
            })
        
        # Si c'est un match entre deux humains, rediriger vers le jeu en mode multi
        return JsonResponse({
            'status': 'success', 
            'redirect_url': f'/pong?mode=multi&direct=true&player1={match.player1.username}&player1_alias={player1_alias}&player2={match.player2.username}&player2_alias={player2_alias}&tournament_id={match.tournament.id}&match_id={match.id}'
        })
    
    except TournamentMatch.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Match non trouvé'}, status=404)

@login_required
@csrf_exempt
def save_tournament_match_result(request):
    """API pour enregistrer le résultat d'un match de tournoi"""
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Méthode non autorisée'}, status=405)
    
    try:
        data = json.loads(request.body)
        match_id = data.get('match_id')
        player1_score = data.get('player1_score')
        player2_score = data.get('player2_score')
        vs_bot = data.get('vs_bot', False)
        print(f"Valeur de vs_bot: {vs_bot}")
        
        # IMPORTANT: Utiliser le gagnant fourni par le frontend
        # au lieu de le recalculer côté serveur
        winner_name = data.get('winner')
        print(f"WINNER = {winner_name}")
        
        match = TournamentMatch.objects.get(id=match_id)
        tournament = match.tournament
        
        # Si match vs bot, trouver le bon utilisateur (humain ou bot)
        if vs_bot:
            print(f"Match vs bot - Gagnant indiqué: {winner_name}")
            
            # Utiliser le nom du gagnant pour déterminer l'utilisateur correspondant
            if winner_name == data.get('bot_name'):
                # Le bot a gagné
                # Trouver l'utilisateur correspondant au bot
                bot_user = User.objects.get(username=winner_name)
                match.winner = bot_user
                print(f"Bot gagnant: {bot_user.username}")
            else:
                # L'humain a gagné
                human_user = User.objects.get(username=winner_name)
                match.winner = human_user
                print(f"Humain gagnant: {human_user.username}")
        else:
            # Match normal, déterminer le gagnant par les scores
            if player1_score > player2_score:
                match.winner = match.player1
            else:
                match.winner = match.player2
        
        # Mettre à jour le match
        print(f"Player 1 Score: {match.player1_score}")
        print(f"Player 2 Score: {match.player2_score}")
        match.player1_score = player1_score
        match.player2_score = player2_score
        match.is_completed = True
        match.played_at = timezone.now()
        
        # if player1_score > player2_score:
        #         match.winner = match.player1
        # else:
        #         match.winner = match.player2

        print(f"Match ID: {match.id}")
        print(f"Tournament ID: {match.tournament_id}")
        print(f"Player 1 ID: {match.player1_id}")
        print(f"Player 2 ID: {match.player2_id}")
        print(f"Winner ID: {match.winner_id}")
        print(f"Is Completed: {match.is_completed}")
        print(f"Round: {match.round}")
        print(f"Created At: {match.created_at}")
        print(f"Played At: {match.played_at}")
        match.save()

        print(f"Match ID: {match.id}")
        print(f"Tournament ID: {match.tournament_id}")
        print(f"Player 1 ID: {match.player1_id}")
        print(f"Player 2 ID: {match.player2_id}")
        print(f"Player 1 Score: {match.player1_score}")
        print(f"Player 2 Score: {match.player2_score}")
        print(f"Winner ID: {match.winner_id}")
        print(f"Is Completed: {match.is_completed}")
        print(f"Round: {match.round}")
        print(f"Created At: {match.created_at}")
        print(f"Played At: {match.played_at}")
        
        # Ajouter le match à l'historique des joueurs humains
        duration = data.get('duration', 60)  # Durée par défaut de 60 secondes si non fournie
        
        # Pour match.player1 (s'il n'est pas un bot)
        if not TournamentParticipant.objects.filter(tournament=tournament, user=match.player1, is_bot=True).exists():
            is_winner = match.winner == match.player1
            is_perfect = is_winner and match.player2_score == 0
            
            GameStatistics.objects.create(
                player=match.player1,
                opponent=match.player2.username,
                player_score=match.player1_score,
                computer_score=match.player2_score,
                difficulty="md",  # Difficulté moyenne par défaut
                duration=duration,
                is_perfect_game=is_perfect,
                is_multiplayer=not vs_bot,
                date_played=match.played_at,
                is_tournament_match=True,
                tournament_name=tournament.name,
                tournament_round=match.round
            )
        
        # Pour match.player2 (s'il n'est pas un bot)
        if not TournamentParticipant.objects.filter(tournament=tournament, user=match.player2, is_bot=True).exists():
            is_winner = match.winner == match.player2
            is_perfect = is_winner and match.player1_score == 0
            
            GameStatistics.objects.create(
                player=match.player2,
                opponent=match.player1.username,
                player_score=match.player2_score,
                computer_score=match.player1_score,
                difficulty="md",  # Difficulté moyenne par défaut
                duration=duration,
                is_perfect_game=is_perfect,
                is_multiplayer=not vs_bot,
                date_played=match.played_at,
                is_tournament_match=True,
                tournament_name=tournament.name,
                tournament_round=match.round
            )
        
        # Vérifier si le tour est terminé
        check_round_completion(tournament)
        
        return JsonResponse({
            'status': 'success',
            'message': 'Résultat du match enregistré',
            'match_id': match_id,
            'tournament_id': tournament.id
        })
        
    except TournamentMatch.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Match non trouvé'}, status=404)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)