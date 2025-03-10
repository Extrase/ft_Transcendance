from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic.base import TemplateView
from django.contrib.auth import views as auth_views
from django.conf import settings
from django.conf.urls.static import static
from .views import CustomLoginView
import accounts.views

urlpatterns = [
    path('admin/', admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path('auth/password_change/', accounts.views.PasswordChangeAPIView.as_view(), name='password_change'),
    path('auth/password_change/done/', accounts.views.PasswordChangeDoneAPIView.as_view(), name='password_change_done'),
    path('auth/update_user/', accounts.views.update_user, name='update_user'),
    path('auth/delete_user/', accounts.views.delete_user, name='delete_user'),
    path('api/user-data/', accounts.views.get_user_data, name='get_user_data'),
    # API routes
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

    # Routes Pong
    path('pong/', accounts.views.index, name='pong_index'),  # Page principale du jeu Pong
    path('api/pong/save-stats/', accounts.views.save_game_stats, name='save_game_stats'),  # Sauvegarde des stats de jeu
    path('api/pong/stats/', accounts.views.get_player_stats, name='get_player_stats'),  # Récupération des stats Pong
    path('api/profile-pong-stats/', accounts.views.get_combined_profile_stats, name='get_combined_profile_stats'),  # Stats combinées Profil+Pong

    # Ajout des routes pour le chat
    path('chat/', include('chat.urls', namespace='chat')),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
