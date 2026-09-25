from rest_framework.authentication import SessionAuthentication

class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    SessionAuthentication without CSRF enforcement for frictionless SPA API integration.
    """
    def enforce_csrf(self, request):
        return
