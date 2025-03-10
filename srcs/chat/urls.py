# urls.py
from django.urls import path
from . import views

app_name = 'chat'

urlpatterns = [
    path('', views.chat_view, name='chat'),
    path('send_message/', views.send_message, name='send_message'),
    path('messages/<int:user_id>/', views.get_user_messages, name='get_user_messages'),
    path('block_user/<int:user_id>/', views.block_user, name='block_user'),
    path('unblock_user/<int:user_id>/', views.unblock_user, name='unblock_user'),
    path('send_game_invite/<int:user_id>/', views.send_game_invite, name='send_game_invite'),
    path('profile/<int:user_id>/', views.view_profile, name='view_profile'),
  
    path('game/start/<int:opponent_id>/', views.start_game, name='start_game'),
    path('accept_game_invite/<int:sender_id>/', views.accept_game_invite, name='accept_game_invite'),
    path('reject_game_invite/<int:sender_id>/', views.reject_game_invite, name='reject_game_invite'),

    # Nouvel endpoint API pour les utilisateurs
    path('api/users/', views.api_get_users, name='api_get_users'),
]