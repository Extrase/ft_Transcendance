# Generated by Django 5.1.4 on 2025-03-02 02:03

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0008_userprofile'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='blocked_users',
            field=models.ManyToManyField(blank=True, related_name='chat_blocked_by', to=settings.AUTH_USER_MODEL),
        ),
    ]
