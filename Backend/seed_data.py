import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'us24_core.settings')
django.setup()

from django.contrib.auth.models import User
from django.utils import timezone
from tasks.models import UserProfile, Task, TaskLog

def seed():
    print("[INFO] Starting US24 Solutions database seeding...")

    # 1. Create Users & Profiles
    users_info = [
        {
            'username': 'admin',
            'email': 'admin@us24solutions.com',
            'first_name': 'Admin',
            'last_name': 'Director',
            'role': 'admin',
            'employee_id': 'US24-ADM01',
            'phone': '+1 (800) 240-0001',
            'color': '#3b82f6'
        },
        {
            'username': 'sourabh',
            'email': 'sourabh@us24solutions.com',
            'first_name': 'Sourabh',
            'last_name': 'Sharma',
            'role': 'employee',
            'employee_id': 'US24-EMP01',
            'phone': '+1 (800) 240-0101',
            'color': '#2563eb'
        },
        {
            'username': 'rohit',
            'email': 'rohit@us24solutions.com',
            'first_name': 'Rohit',
            'last_name': 'Verma',
            'role': 'employee',
            'employee_id': 'US24-EMP02',
            'phone': '+1 (800) 240-0102',
            'color': '#06b6d4'
        },
        {
            'username': 'gautam',
            'email': 'gautam@us24solutions.com',
            'first_name': 'Gautam',
            'last_name': 'Patel',
            'role': 'employee',
            'employee_id': 'US24-EMP03',
            'phone': '+1 (800) 240-0103',
            'color': '#10b981'
        },
        {
            'username': 'manish',
            'email': 'manish@us24solutions.com',
            'first_name': 'Manish',
            'last_name': 'Gupta',
            'role': 'employee',
            'employee_id': 'US24-EMP04',
            'phone': '+1 (800) 240-0104',
            'color': '#f59e0b'
        },
        {
            'username': 'jitendra',
            'email': 'jitendra@us24solutions.com',
            'first_name': 'Jitendra',
            'last_name': 'Singh',
            'role': 'employee',
            'employee_id': 'US24-EMP05',
            'phone': '+1 (800) 240-0105',
            'color': '#8b5cf6'
        },
    ]

    user_map = {}
    for udata in users_info:
        user, created = User.objects.get_or_create(
            username=udata['username'],
            defaults={
                'email': udata['email'],
                'first_name': udata['first_name'],
                'last_name': udata['last_name'],
                'is_staff': (udata['role'] == 'admin'),
                'is_superuser': (udata['role'] == 'admin')
            }
        )
        user.set_password('pass123' if udata['role'] != 'admin' else 'admin123')
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = udata['role']
        profile.employee_id = udata['employee_id']
        profile.phone = udata['phone']
        profile.avatar_color = udata['color']
        profile.save()

        user_map[udata['username']] = user
        print(f"  - User ready: {user.username} ({udata['first_name']} {udata['last_name']})")

    # 2. Create Initial Tasks
    tasks_data = [
        {
            'task_id': 'TSK-2026-001',
            'category': 'credentialing',
            'project_name': 'US24 Health Group',
            'task_name': 'Medicare Provider Enrollment Revalidation',
            'sub_plan': 'CMS 855I Individual Specialist Plan',
            'insurance_name': 'Medicare Part B (Noridian)',
            'assignee': user_map['sourabh'],
            'follow_up_type': 'call',
            'follow_up_value': '+1 (800) 633-4227',
            'status': 'In Progress',
            'notes': 'Follow up on revalidation tracking #MED-99481; pending CAQH attestation verification.'
        },
        {
            'task_id': 'TSK-2026-002',
            'category': 'portal_creation',
            'project_name': 'Metro Health Clinic',
            'task_name': 'Availity Essentials Organization Admin Setup',
            'sub_plan': 'Provider Multi-NPI Portal Access',
            'insurance_name': 'Availity Multi-Payer Clearinghouse',
            'assignee': user_map['rohit'],
            'follow_up_type': 'portal',
            'follow_up_value': 'https://apps.availity.com/availity/web/public.elegant.login',
            'status': 'Assigned',
            'notes': 'Configure sub-accounts for billing analysts and link Tax ID 84-293819.'
        },
        {
            'task_id': 'TSK-2026-003',
            'category': 'era_eft',
            'project_name': 'Pacific Coast Orthopedics',
            'task_name': 'Electronic Remittance Advice (835) Routing Setup',
            'sub_plan': 'Direct Deposit ACH Linking',
            'insurance_name': 'Blue Cross Blue Shield California',
            'assignee': user_map['gautam'],
            'follow_up_type': 'email',
            'follow_up_value': 'edi.enrollment@bcbs.com',
            'status': 'Pending Info',
            'notes': 'Voided check and signed bank authorization letter submitted; awaiting bank verification callback.'
        },
        {
            'task_id': 'TSK-2026-004',
            'category': 'credentialing',
            'project_name': 'Horizon Surgical Associates',
            'task_name': 'Aetna Commercial In-Network Credentialing',
            'sub_plan': 'Standard Commercial PPO Agreement',
            'insurance_name': 'Aetna Health Care',
            'assignee': user_map['manish'],
            'follow_up_type': 'call',
            'follow_up_value': '+1 (888) 632-3862',
            'status': 'Completed',
            'notes': 'Contract counter-signed and active effective Sep 01, 2026. Provider ID #AET-77192.'
        },
        {
            'task_id': 'TSK-2026-005',
            'category': 'portal_creation',
            'project_name': 'Austin Wellness Partners',
            'task_name': 'UnitedHealthcare Provider Portal Account Activation',
            'sub_plan': 'Optum ID & Link Setup',
            'insurance_name': 'UnitedHealthcare / Optum',
            'assignee': user_map['jitendra'],
            'follow_up_type': 'portal',
            'follow_up_value': 'https://www.uhcprovider.com',
            'status': 'In Progress',
            'notes': 'Optum ID generated; two-step security questions configured for clinic billing team.'
        },
        {
            'task_id': 'TSK-2026-006',
            'category': 'era_eft',
            'project_name': 'Trinity Family Practice',
            'task_name': 'Cigna 835 ERA & EFT Direct Pay Enrollment',
            'sub_plan': 'Electronic Funds Transfer Enrollment',
            'insurance_name': 'Cigna Healthcare',
            'assignee': user_map['sourabh'],
            'follow_up_type': 'email',
            'follow_up_value': 'remittance@cigna.com',
            'status': 'Assigned',
            'notes': 'Submission pending practice manager digital signature via DocuSign.'
        },
        {
            'task_id': 'TSK-2026-007',
            'category': 'credentialing',
            'project_name': 'Silverline Pediatrics',
            'task_name': 'Medicaid State Plan Facility Credentialing',
            'sub_plan': 'CHIP & Title XIX Medicaid Provider Enrollment',
            'insurance_name': 'State Department of Health Medicaid',
            'assignee': user_map['rohit'],
            'follow_up_type': 'call',
            'follow_up_value': '+1 (800) 457-4584',
            'status': 'In Progress',
            'notes': 'Fingerprint background check completed; awaiting site inspection clearance.'
        }
    ]

    admin_user = user_map['admin']
    for tdata in tasks_data:
        task, created = Task.objects.update_or_create(
            task_id=tdata['task_id'],
            defaults={
                'category': tdata['category'],
                'project_name': tdata['project_name'],
                'task_name': tdata['task_name'],
                'sub_plan': tdata['sub_plan'],
                'insurance_name': tdata['insurance_name'],
                'assignee': tdata['assignee'],
                'created_by': admin_user,
                'follow_up_type': tdata['follow_up_type'],
                'follow_up_value': tdata['follow_up_value'],
                'status': tdata['status'],
                'notes': tdata['notes'],
            }
        )
        print(f"  - Task seeded: [{task.task_id}] {task.task_name}")

        # Seed initial log if none exists
        if task.logs.count() == 0:
            TaskLog.objects.create(
                task=task,
                updated_by=admin_user,
                previous_status='',
                new_status=task.status,
                remarks=f"Initial task creation and assignment to {task.assignee.get_full_name()}."
            )
            if task.status in ['In Progress', 'Pending Info', 'Completed']:
                TaskLog.objects.create(
                    task=task,
                    updated_by=task.assignee,
                    previous_status='Assigned',
                    new_status=task.status,
                    remarks=f"Progress updated by {task.assignee.get_full_name()}: {task.notes}"
                )

    print("[SUCCESS] Seeding completed successfully! US24 Solutions data ready.")

if __name__ == '__main__':
    seed()
