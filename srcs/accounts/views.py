import json
import os
import requests
import secrets
import uuid
from urllib.parse import urlencode

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
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.views.generic import CreateView

from .forms import AchievementForm, LoginForm, SignupForm, UpdateUserForm
from .models import Profile, Achievement, Notification, GameStatistics, PlayerStats

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
        try:
            # Vérifier si le fichier existe
            if os.path.exists(os.path.join(settings.MEDIA_ROOT, request.user.profile_photo.name)):
                profile_photo_url = request.user.profile_photo.url
            else:
                profile_photo_url = '/static/images/default_avatar.jpg'
        except:
            profile_photo_url = '/static/images/default_avatar.jpg'
    else:
        profile_photo_url = '/static/images/default_avatar.jpg'

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
            for notification in profile.notifications.all()
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
            "achievements": [
                {"name": achievement.name, "icon": achievement.icon}
                for achievement in friend_profile.achievements.all()
            ]
        }
        
        return JsonResponse(profile_data)
    
    except User.DoesNotExist:
        return JsonResponse({'error': 'Utilisateur non trouvé'}, status=404)
    except Profile.DoesNotExist:
        return JsonResponse({'error': 'Profil non trouvé'}, status=404)

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

@csrf_exempt
@login_required
def save_game_stats(request):
    """API pour sauvegarder les statistiques d'une partie"""
    if request.method == 'POST':
        try:
            print("Received save_game_stats request")
            data = json.loads(request.body)
            print(f"Received data: {data}")

            # Récupérer ou créer les stats du joueur
            player_stats, created = PlayerStats.objects.get_or_create(player=request.user)

            # Mettre à jour les stats globales
            player_stats.total_games += 1

            # Déterminer le gagnant et mettre à jour les stats
            is_perfect_game = False
            if data['player_score'] > data['computer_score']:
                player_stats.games_won += 1
                if data['computer_score'] == 0:
                    is_perfect_game = True
                    player_stats.perfect_games += 1
            else:
                player_stats.games_lost += 1

            # Calculer le taux de victoire
            if player_stats.total_games > 0:
                player_stats.win_ratio = (player_stats.games_won / player_stats.total_games) * 100

            player_stats.save()

            # Enregistrer cette partie spécifique
            game = GameStatistics.objects.create(
                player=request.user,
                player_score=data['player_score'],
                computer_score=data['computer_score'],
                difficulty=data.get('difficulty', 'medium'),
                is_perfect_game=is_perfect_game
            )

            # Mettre à jour également le profil principal de l'utilisateur
            profile = request.user.profile
            profile.games_played += 1
            profile.last_played_game = 'Pong'

            # Calculer le nouveau taux de victoire global pour le profil
            if player_stats.total_games > 0:
                ratio = (player_stats.games_won / player_stats.total_games) * 100
                profile.win_rate = ratio

            # Ajouter les points au score total
            profile.total_score += data['player_score']

            # Utiliser la durée réelle si elle est fournie, sinon valeur par défaut
            game_duration = data.get('duration', 5.0)  # en secondes
            # Convertir en minutes pour la cohérence avec le reste du code
            game_duration_minutes = game_duration / 60.0
            
            # Mise à jour du temps de jeu avec la durée réelle
            profile.time_played += game_duration_minutes

            profile.save()

            return JsonResponse({'success': True, 'message': 'Game stats saved successfully'})

        except Exception as e:
            print(f"Error saving game stats: {e}")
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Only POST method is allowed'}, status=405)

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