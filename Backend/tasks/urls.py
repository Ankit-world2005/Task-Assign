from django.urls import path, include
from rest_framework.routers import DefaultRouter
from tasks.views import (
    login_api, verify_otp_api, me_api, logout_api,
    users_list_api, create_user_api, toggle_user_access_api,
    update_user_api, reset_user_password_api, delete_user_api,
    TaskViewSet, stats_api, profile_dashboard_api,
    export_csv_api, import_csv_api, import_excel_api
)

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    # Authentication & User endpoints
    path('auth/login/', login_api, name='api_login'),
    path('auth/verify-otp/', verify_otp_api, name='api_verify_otp'),
    path('auth/me/', me_api, name='api_me'),
    path('auth/logout/', logout_api, name='api_logout'),
    path('auth/users/', users_list_api, name='api_users_list'),
    path('auth/users/create/', create_user_api, name='api_create_user'),
    path('auth/users/<int:user_id>/toggle-access/', toggle_user_access_api, name='api_toggle_user_access'),
    path('auth/users/<int:user_id>/update/', update_user_api, name='api_update_user'),
    path('auth/users/<int:user_id>/reset-password/', reset_user_password_api, name='api_reset_user_password'),
    path('auth/users/<int:user_id>/delete/', delete_user_api, name='api_delete_user'),

    # Analytics & Reports
    path('stats/', stats_api, name='api_stats'),
    path('profile/dashboard/', profile_dashboard_api, name='api_profile_dashboard'),
    path('export-csv/', export_csv_api, name='api_export_csv'),
    path('import-excel/', import_excel_api, name='api_import_excel'),
    path('import-csv/', import_excel_api, name='api_import_csv'),

    # Task Router (list, create, retrieve, update, delete, add-log)
    path('', include(router.urls)),
]
