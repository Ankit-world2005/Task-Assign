from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Administrator'),
        ('employee', 'Employee'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')
    employee_id = models.CharField(max_length=50, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    department = models.CharField(max_length=100, default='Operations & Enrollment')
    avatar_color = models.CharField(max_length=20, default='#2563eb')
    current_otp = models.CharField(max_length=6, blank=True, null=True)
    otp_created_at = models.DateTimeField(null=True, blank=True)

    objects = models.Manager()

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"


class Task(models.Model):
    CATEGORY_CHOICES = [
        ('credentialing', 'Credentialing'),
        ('portal_creation', 'Portal Creation'),
        ('era_eft', 'ERA/EFT'),
        ('password_reset', 'Password Reset'),
        ('portal_unblock', 'Portal Unblock'),
        ('general', 'General'),
    ]

    STATUS_CHOICES = [
        ('Request', 'Request'),
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('Panel closed', 'Panel closed'),
        ('Assigned', 'Assigned'),
        ('In Progress', 'In Progress'),
        ('In Process', 'In Process'),
        ('Pending Info', 'Pending Info'),
        ('Completed', 'Completed'),
        ('Cancelled', 'Cancelled'),
    ]

    FOLLOW_UP_CHOICES = [
        ('call', 'Call'),
        ('email', 'Email'),
        ('portal', 'Portal'),
    ]

    task_id = models.CharField(max_length=50, unique=True, db_index=True, blank=True, default='')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='credentialing')
    project_name = models.CharField(max_length=255)
    task_name = models.CharField(max_length=255)
    provider_name = models.CharField(max_length=255, blank=True, null=True, default='')
    provider_effective_date = models.DateField(null=True, blank=True)
    group_ptan = models.CharField(max_length=100, blank=True, default='', verbose_name='G-PTAN ID')
    individual_ptan = models.CharField(max_length=100, blank=True, default='', verbose_name='P-PTAN ID')
    early_start_date = models.DateField(null=True, blank=True)
    sub_plan = models.CharField(max_length=255, blank=True, default='')
    insurance_name = models.CharField(max_length=255)
    creation_date = models.DateField(default=timezone.localdate)
    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tasks')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_tasks')
    follow_up_type = models.CharField(max_length=20, choices=FOLLOW_UP_CHOICES, default='call')
    follow_up_value = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Request')
    notes = models.TextField(blank=True, default='')
    attachment = models.TextField(blank=True, null=True, default='')
    # Latest portal credentials, saved from an Approved update (portal creation / password reset)
    portal_link = models.CharField(max_length=500, blank=True, default='')
    portal_user_id = models.CharField(max_length=255, blank=True, default='')
    portal_password = models.CharField(max_length=255, blank=True, default='')
    # Follow-up schedule from the latest update: due date = work date + MOC F/W days
    work_date = models.DateField(null=True, blank=True)
    follow_up_days = models.PositiveIntegerField(null=True, blank=True)
    follow_up_due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not getattr(self, 'attachment', None):
            setattr(self, 'attachment', '')
        current_id = getattr(self, 'task_id', '')
        if not current_id or Task.objects.filter(task_id=current_id).exclude(pk=self.pk).exists():
            import re
            year = timezone.localdate().year
            existing_ids = Task.objects.values_list('task_id', flat=True)
            max_num = 0
            pattern = re.compile(rf'TSK-{year}-(\d+)')
            for tid in existing_ids:
                m = pattern.match(tid or '')
                if m:
                    try:
                        num = int(m.group(1))
                        if num > max_num:
                            max_num = num
                    except ValueError:
                        pass
            next_num = max_num + 1
            candidate = f"TSK-{year}-{next_num:03d}"
            while Task.objects.filter(task_id=candidate).exclude(pk=self.pk).exists():
                next_num += 1
                candidate = f"TSK-{year}-{next_num:03d}"
            setattr(self, 'task_id', candidate)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.task_id}] {self.task_name} ({self.insurance_name})"


MOC_CHOICES = [
    ('call', 'Call'),
    ('email', 'Email'),
    ('fax', 'Fax'),
]


class TaskLog(models.Model):
    MOC_CHOICES = MOC_CHOICES

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='logs')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='authored_logs')
    previous_status = models.CharField(max_length=50, blank=True, default='')
    new_status = models.CharField(max_length=50, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    attachment = models.TextField(blank=True, null=True, default='')
    reassigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reassigned_logs')
    moc = models.CharField(max_length=20, choices=MOC_CHOICES, blank=True, default='')
    tat = models.CharField(max_length=20, blank=True, default='')
    work_date = models.DateField(null=True, blank=True)
    follow_up_days = models.PositiveIntegerField(null=True, blank=True)
    portal_link = models.CharField(max_length=500, blank=True, default='')
    portal_user_id = models.CharField(max_length=255, blank=True, default='')
    portal_password = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not getattr(self, 'attachment', None):
            setattr(self, 'attachment', '')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Log for {self.task.task_id} by {self.updated_by} at {self.created_at}"
