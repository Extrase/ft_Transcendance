# accounts/models.py
from django.contrib.auth.models import AbstractUser, User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
import uuid


def user_profile_photo_path(instance, filename):
    return f'users/avatars/avatar_{uuid.uuid4()}'

class User(AbstractUser):
    email = models.EmailField(unique=True)
    profile_photo = models.ImageField(
        verbose_name='Avatar',
        upload_to='users/avatars/',
        blank=True,
        null=True,
    )
    online = models.BooleanField(default=False)
    is_42_user = models.BooleanField(default=False)
    intra_profile_url = models.URLField(max_length=255, null=True, blank=True)

class Achievement(models.Model):
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=50)

    def __str__(self):
        return self.name

class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    message = models.CharField(max_length=255)
    type = models.CharField(max_length=20, default='info')
    created_at = models.DateTimeField(auto_now_add=True)

class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    level = models.IntegerField(default=0)
    games_played = models.IntegerField(default=0)
    win_rate = models.FloatField(default=0.0)
    total_score = models.IntegerField(default=0)
    friends = models.ManyToManyField('self', symmetrical=False, related_name='friends_set')
    last_played_game = models.CharField(max_length=100, blank=True, null=True)
    time_played = models.FloatField(default=0.0)
    achievements = models.ManyToManyField(Achievement, related_name='profiles')
    profile_gradient_start = models.CharField(max_length=7, default='#1b2838')
    profile_gradient_end = models.CharField(max_length=7, default='#2a475e')
    notifications = models.ManyToManyField(Notification, blank=True)

    def __str__(self):
        return f"Profile de {self.user.username}"

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    instance.profile.save()

class GameStatistics(models.Model):
    DIFFICULTY_CHOICES = [
        ('es', 'Easy'),
        ('md', 'Medium'),
        ('hd', 'Hard')
    ]
    player = models.ForeignKey(User, on_delete=models.CASCADE)
    opponent = models.CharField(max_length=100, default='AI')  # Peut être "AI" ou un nom d'utilisateur
    player_score = models.IntegerField(default=0)
    computer_score = models.IntegerField(default=0)
    difficulty = models.CharField(max_length=2, choices=DIFFICULTY_CHOICES, default='md')
    duration = models.FloatField(default=0)  # Durée en secondes
    is_perfect_game = models.BooleanField(default=False)
    is_multiplayer = models.BooleanField(default=False)
    date_played = models.DateTimeField(auto_now_add=True)
    is_tournament_match = models.BooleanField(default=False)  # Nouveau champ
    tournament_name = models.CharField(max_length=255, null=True, blank=True)  # Nouveau champ
    tournament_round = models.IntegerField(null=True, blank=True)  # Nouveau champ
    
    def __str__(self):
        return f"{self.player.username} vs {self.opponent} - {self.date_played.strftime('%Y-%m-%d %H:%M')}"

    class Meta:
        ordering = ['-date_played']

class PlayerStats(models.Model):
    player = models.OneToOneField(User, on_delete=models.CASCADE)
    total_games = models.IntegerField(default=0)
    games_won = models.IntegerField(default=0)
    games_lost = models.IntegerField(default=0)
    perfect_games = models.IntegerField(default=0)
    win_ratio = models.FloatField(default=0.0)

    def __str__(self):
        return f"Stats for {self.player.username}"
