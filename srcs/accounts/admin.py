from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html
from .models import Profile, Achievement
from accounts.models import User

# Register your models here.

admin.site.register(User)

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    """
    Configuration admin pour les profils
    """
    list_display = (
        'get_username', 
        'level', 
        'games_played', 
        'win_rate', 
        'total_score', 
        'last_played_game',
        'user_link'
    )
    
    list_filter = (
        'level', 
        'games_played'
    )
    
    search_fields = ('user__username',)
    
    def get_username(self, obj):
        return obj.user.username
    get_username.short_description = 'Nom d\'utilisateur'
    
    def user_link(self, obj):
        """
        Crée un lien cliquable vers la page de l'utilisateur
        """
        url = reverse('admin:accounts_user_change', args=[obj.user.pk])
        return format_html('<a href="{}">Voir l\'utilisateur</a>', url)
    user_link.short_description = 'Utilisateur'
    
    # Personnaliser l'affichage des réalisations
    filter_horizontal = ('achievements', 'friends')

@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    """
    Configuration admin pour les réalisations (achievements)
    """
    list_display = ('name', 'icon')
    search_fields = ('name',)