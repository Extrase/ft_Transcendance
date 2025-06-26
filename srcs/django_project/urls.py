from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic.base import TemplateView, RedirectView
from django.shortcuts import render
from django.http import HttpResponseRedirect
from django.contrib.auth import views as auth_views
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.staticfiles.storage import staticfiles_storage
from chat import views as chat_views
from .views import CustomLoginView
import accounts.views

def spa_fallback(request, path=None):
    """Gère toutes les routes SPA non définies explicitement"""
    
    # Cas spécial: route callback avec code OAuth
    if path == 'callback' and request.GET.get('code'):
        print("Redirection du callback 42 depuis le SPA fallback")
        # Ne pas renvoyer la vue callback directement, mais rediriger vers /callback/
        # car la vue callback a besoin de tous les paramètres d'URL
        return HttpResponseRedirect(f'/callback/?{request.GET.urlencode()}')
        
    # Pour toutes les autres routes, renvoyer l'application SPA
    return render(request, 'base.html')

urlpatterns = [
    path('admin/', admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path('auth/password_change/', accounts.views.PasswordChangeAPIView.as_view(), name='password_change'),
    path('auth/password_change/done/', accounts.views.PasswordChangeDoneAPIView.as_view(), name='password_change_done'),
    path('auth/update_user/', accounts.views.update_user, name='update_user'),
    path('auth/delete_user/', accounts.views.delete_user, name='delete_user'),
    path('api/user-data/', accounts.views.get_user_data, name='get_user_data'),
    path('favicon.ico', RedirectView.as_view(
        url=staticfiles_storage.url('favicon_io/favicon.ico'))),
    # API routes
    path('api/profile/colors/', accounts.views.save_profile_colors, name='save_profile_colors'),
    path('api/login/', accounts.views.api_login, name='api_login'),
    path('login/', accounts.views.login_view, name='login'),
    path('', accounts.views.home, name='home'),
    path('api/home/', accounts.views.api_home, name='api_home'),
    path('api/signup/', accounts.views.signup_view, name='signup_api'),
    path('logout/', accounts.views.logout_user, name='logout'),
    path('api/check-auth/', accounts.views.api_check_auth, name='api_check_auth'),
    path('api/42/', accounts.views.initiate_42_auth, name='initiate_42_auth'),
    path('callback/', accounts.views.callback_view, name='callback_42'),
    path('api/profile/', accounts.views.profile_view, name='profile_view'),
    path('debug-photo/', accounts.views.debug_profile_photo, name='debug_photo'),
    path('add-friend/<str:username>/', accounts.views.add_friend, name='add_friend'),
    path('remove_friend/<str:username>', accounts.views.remove_friend, name='remove_friend'),
    path('api/friends-status/', accounts.views.friends_status, name='friends_status'),
    path('api/check-new-friends/', accounts.views.check_new_friends, name='check_new_friends'),
    path('api/friend-profile/<str:username>/', accounts.views.friend_profile_view, name='friend_profile_view'),

    # Tournois

    path('api/tournaments/', accounts.views.list_tournaments, name='list_tournaments'),
    path('api/tournaments/create/', accounts.views.create_tournament, name='create_tournament'),
    path('api/tournaments/<int:tournament_id>/', accounts.views.tournament_detail, name='tournament_detail'),
    path('api/tournaments/<int:tournament_id>/join/', accounts.views.join_tournament, name='join_tournament'),
    path('api/tournaments/<int:tournament_id>/leave/', accounts.views.leave_tournament, name='leave_tournament'),
    path('api/tournaments/<int:tournament_id>/start/', accounts.views.start_tournament, name='start_tournament'),
    path('api/tournament-matches/<int:match_id>/play/', accounts.views.play_tournament_match, name='play_tournament_match'),
    path('api/tournament-matches/save-result/', accounts.views.save_tournament_match_result, name='save_tournament_match_result'),

    # Routes Pong
    path('pong/', accounts.views.index, name='pong_index'),  # Page principale du jeu Pong
    path('api/pong/save-stats/', accounts.views.save_game_stats, name='save_game_stats'),  # Sauvegarde des stats de jeu
    path('api/pong/stats/', accounts.views.get_player_stats, name='get_player_stats'),  # Récupération des stats Pong
    path('api/profile-pong-stats/', accounts.views.get_combined_profile_stats, name='get_combined_profile_stats'),  # Stats combinées Profil+Pong

    # Ajout des routes pour le chat
    path('chat/', include('chat.urls', namespace='chat')),
    path('api/chat/ping/', chat_views.chat_ping, name='chat_ping'),

    re_path(r'^(?P<path>.*)$', spa_fallback, name='spa-fallback'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
