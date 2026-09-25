from rest_framework import serializers
from django.contrib.auth.models import User
from tasks.models import UserProfile, Task, TaskLog

# Task types whose approval must record portal User ID and Password (portal creation also needs the Portal Link)
PORTAL_CREDENTIAL_CATEGORIES = ('portal_creation', 'password_reset')

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['role', 'employee_id', 'phone', 'department', 'avatar_color']


class UserDetailSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'profile', 'is_active', 'date_joined', 'last_login']

    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name if name else obj.username


class TaskLogSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()
    reassigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = TaskLog
        fields = [
            'id', 'task', 'updated_by', 'updated_by_name',
            'previous_status', 'new_status', 'remarks', 'attachment',
            'reassigned_to', 'reassigned_to_name',
            'moc', 'tat', 'work_date', 'follow_up_days',
            'portal_link', 'portal_user_id', 'portal_password', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_updated_by_name(self, obj):
        if obj.updated_by:
            name = f"{obj.updated_by.first_name} {obj.updated_by.last_name}".strip()
            return name if name else obj.updated_by.username
        return "System"

    def get_reassigned_to_name(self, obj):
        if obj.reassigned_to:
            name = f"{obj.reassigned_to.first_name} {obj.reassigned_to.last_name}".strip()
            return name if name else obj.reassigned_to.username
        return None


class TaskSerializer(serializers.ModelSerializer):
    task_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    provider_name = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    provider_effective_date = serializers.DateField(format='%Y-%m-%d', required=False, allow_null=True)
    early_start_date = serializers.DateField(format='%Y-%m-%d', required=False, allow_null=True)
    group_ptan = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    individual_ptan = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    creation_date = serializers.DateField(format='%Y-%m-%d', required=False, allow_null=True)
    sub_plan = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    follow_up_value = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    attachment = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    assignee_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    logs = TaskLogSerializer(many=True, read_only=True)

    class Meta:
        model = Task
        fields = [
            'id', 'task_id', 'category', 'project_name', 'task_name', 'provider_name',
            'provider_effective_date', 'group_ptan', 'individual_ptan', 'early_start_date',
            'sub_plan', 'insurance_name', 'creation_date',
            'assignee', 'assignee_name', 'created_by', 'created_by_name',
            'follow_up_type', 'follow_up_value', 'status', 'notes', 'attachment',
            'portal_link', 'portal_user_id', 'portal_password',
            'work_date', 'follow_up_days', 'follow_up_due_date',
            'created_at', 'updated_at', 'logs'
        ]
        # Portal credentials and the follow-up schedule are only set through the add-log update
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'portal_link', 'portal_user_id', 'portal_password',
            'work_date', 'follow_up_days', 'follow_up_due_date',
        ]
        extra_kwargs = {
            'task_id': {'required': False, 'validators': []}
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)

        # Convert empty string / 'null' to None for date fields
        for date_field in ['provider_effective_date', 'early_start_date']:
            if data.get(date_field) in ('', 'null', None):
                data[date_field] = None

        if data.get('creation_date') in ('', 'null', None):
            data.pop('creation_date', None)

        # Convert None / null to empty string for text fields so DRF doesn't reject with 'may not be null'
        text_fields = [
            'provider_name', 'group_ptan', 'individual_ptan',
            'sub_plan', 'follow_up_value', 'notes', 'attachment',
            'task_id', 'task_name'
        ]
        for field in text_fields:
            if field in data and data.get(field) is None:
                data[field] = ''

        if not data.get('task_name'):
            data['task_name'] = data.get('project_name', 'Task')

        return super().to_internal_value(data)

    def validate(self, attrs):
        # Portal credentials can only be entered through Add Update, so portal creation / password reset tasks
        # can't be created as Approved or switched to Approved by a plain task edit
        category = attrs.get('category', getattr(self.instance, 'category', None))
        new_status = attrs.get('status', getattr(self.instance, 'status', None))
        becoming_approved = new_status == 'Approved' and getattr(self.instance, 'status', None) != 'Approved'
        if becoming_approved and category in PORTAL_CREDENTIAL_CATEGORIES:
            raise serializers.ValidationError({
                'detail': 'Approve portal creation and password reset tasks with Add Update so the Portal Link, '
                          'User ID and Password are recorded.'
            })
        return super().validate(attrs)

    def get_assignee_name(self, obj):
        if obj.assignee:
            name = f"{obj.assignee.first_name} {obj.assignee.last_name}".strip()
            return name if name else obj.assignee.username
        return "Unassigned"

    def get_created_by_name(self, obj):
        if obj.created_by:
            name = f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
            return name if name else obj.created_by.username
        return "Admin"

