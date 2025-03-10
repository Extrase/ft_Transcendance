from django.urls import path
from .views import SignUpView, profile_view, add_achievement, add_friend, remove_friend, get_notifications
from django.conf import settings
from django.conf.urls.static import static

import accounts.views

from . import views

app_name = 'accounts'

urlpatterns = [
    # path("signup/", accounts.views.signup_page, name="signup"),
    path("profile/", profile_view, name="profile"),
    path("add_achievement/", add_achievement, name="add_achievement"),
    path('add_friend/<str:username>/', add_friend, name='add_friend'),
    path('remove_friend/<str:username>/', remove_friend, name='remove_friend'),
    path('get_notifications/', get_notifications, name='get_notifications'),
    path('auth/delete_user/', views.delete_user, name='delete_user'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
