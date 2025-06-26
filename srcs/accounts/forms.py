from django import forms
from .models import Achievement
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserCreationForm

class AchievementForm(forms.Form):
    achievement = forms.ModelChoiceField(queryset=Achievement.objects.all(), label='Achievement')

class LoginForm(forms.Form):
    username = forms.CharField(max_length=63, label='Nom d’utilisateur')
    password = forms.CharField(max_length=63, widget=forms.PasswordInput, label='Mot de passe')


class SignupForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = get_user_model()
        fields = ['username', 'email', 'first_name', 'last_name', 'profile_photo']

class UpdateUserForm(forms.ModelForm):
    class Meta:
        model = get_user_model()
        fields = ['username', 'email', 'first_name', 'last_name', 'profile_photo']
        widgets = {
            'profile_photo': forms.FileInput(attrs={
                'class': 'form-control',
                'label': 'Photo de profil',

            })
        }# exclude = ('password',)
