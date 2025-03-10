from django.contrib.auth import views as auth_views
from django.contrib import messages

class CustomLoginView(auth_views.LoginView):
    template_name = 'authentification/login.html'

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, 'You are successfully logged in.')
        return response
