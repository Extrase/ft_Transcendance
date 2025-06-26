# models.py
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from accounts.models import User

from django.db.models.signals import post_save
from django.dispatch import receiver

class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    bio = models.TextField(blank=True)
    blocked_users = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='chat_blocked_by', blank=True)

    def __str__(self):
        return self.user.username

class Message(models.Model):
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='sent_messages', on_delete=models.CASCADE)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='received_messages', on_delete=models.CASCADE)
    content = models.TextField()
    timestamp = models.DateTimeField(default=timezone.now)
    is_read = models.BooleanField(default=False)
    is_game_invite = models.BooleanField(default=False)  # Ajout d'une valeur par défaut
    
    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return self.content


class GameInvite(models.Model):
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='sent_invites', on_delete=models.CASCADE)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='received_invites', on_delete=models.CASCADE)
    timestamp = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Declined')
    ], default='pending')
    
    class Meta:
        indexes = [
            models.Index(fields=['sender', 'recipient', 'status', 'timestamp'])
        ]
        
    def __str__(self):
        return f"{self.sender} -> {self.recipient} ({self.status})"
    
    @property
    def is_expired(self):
        return timezone.now() > self.timestamp + timedelta(minutes=3)
    
    @classmethod
    def clean_expired_invites(cls):
        expired_time = timezone.now() - timedelta(minutes=3)
        cls.objects.filter(
            status='pending',
            timestamp__lt=expired_time
        ).delete()


class Tournament(models.Model):
    """Modèle représentant un tournoi de Pong"""
    name = models.CharField(max_length=100)
    creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name="created_tournaments")
    start_date = models.DateTimeField(default=timezone.now)
    end_date = models.DateTimeField(null=True, blank=True)
    max_participants = models.IntegerField(default=8)  # Doit être une puissance de 2 (4, 8, 16, etc.)
    is_active = models.BooleanField(default=True)
    is_completed = models.BooleanField(default=False)
    winner = models.ForeignKey(User, on_delete=models.SET_NULL, related_name="won_tournaments", null=True, blank=True)
    current_round = models.IntegerField(default=1)
    
    def __str__(self):
        return f"{self.name} ({self.creator.username})"

    def is_registration_open(self):
        """Vérifie si les inscriptions sont toujours ouvertes"""
        return (self.is_active and 
                not self.is_completed and 
                self.participants.count() < self.max_participants and
                not TournamentMatch.objects.filter(tournament=self).exists())
    
    def generate_first_round(self):
        """Crée les matchs du premier tour"""
        participants = list(self.participants.all())
        import random
        random.shuffle(participants)
        
        matches_created = 0
        while len(participants) >= 2:
            player1 = participants.pop(0).user
            player2 = participants.pop(0).user
            
            TournamentMatch.objects.create(
                tournament=self,
                player1=player1,
                player2=player2,
                round=1
            )
            matches_created += 1
        
        return matches_created > 0

    def advance_round(self):
        """Avance le tournoi au prochain tour"""
        current_matches = TournamentMatch.objects.filter(
            tournament=self, 
            round=self.current_round,
            is_completed=True
        )
        
        winners = [match.winner for match in current_matches]
        
        if len(winners) == 1:
            # Tournoi terminé
            self.is_completed = True
            self.winner = winners[0]
            self.end_date = timezone.now()
            self.save()
            return True
            
        # Créer les matchs du prochain tour
        self.current_round += 1
        while len(winners) >= 2:
            player1 = winners.pop(0)
            player2 = winners.pop(0)
            
            TournamentMatch.objects.create(
                tournament=self,
                player1=player1,
                player2=player2,
                round=self.current_round
            )
        
        self.save()
        return True

class TournamentParticipant(models.Model):
    """Participant à un tournoi"""
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tournament_participations")
    joined_at = models.DateTimeField(auto_now_add=True)
    is_bot = models.BooleanField(default=False)
    alias = models.CharField(max_length=30, blank=True, null=True)

    
    class Meta:
        unique_together = ('tournament', 'user')
    
    def __str__(self):
        display_name = self.alias or self.user.username
        return f"{display_name} in {self.tournament.name}"


class TournamentMatch(models.Model):
    """Match dans un tournoi"""
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="matches")
    player1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tournament_matches_as_player1")
    player2 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tournament_matches_as_player2")
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)
    winner = models.ForeignKey(User, on_delete=models.SET_NULL, related_name="tournament_wins", null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    round = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    played_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.player1.username} vs {self.player2.username} (Round {self.round})"
    
    def complete_match(self, player1_score, player2_score):
        """Termine le match avec les scores donnés"""
        self.player1_score = player1_score
        self.player2_score = player2_score
        self.is_completed = True
        self.played_at = timezone.now()
        
        if player1_score > player2_score:
            self.winner = self.player1
        else:
            self.winner = self.player2
            
        self.save()
        
        # Vérifier si tous les matchs du tour sont terminés
        round_matches = TournamentMatch.objects.filter(
            tournament=self.tournament,
            round=self.tournament.current_round
        )
        
        if round_matches.filter(is_completed=False).count() == 0:
            # Tous les matchs du tour sont terminés, passer au tour suivant
            self.tournament.advance_round()

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)