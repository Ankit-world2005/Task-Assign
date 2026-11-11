// Creates the demo users and tasks (safe to re-run). Run with: npm run seed
// Resets the demo users' passwords to pass123 / admin123.
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { makePassword } from '../src/lib/passwords.js';
import { getTaskByTaskId, insertLog, insertTask, updateTask } from '../src/models/tasks.js';
import { fullName, getOrCreateProfile, getUserById, insertUser, saveProfile } from '../src/models/users.js';

const USERS = [
  { username: 'admin', email: 'admin@us24solutions.com', first_name: 'Admin', last_name: 'Director', role: 'admin', employee_id: 'US24-ADM01', phone: '+1 (800) 240-0001', color: '#3b82f6' },
  { username: 'sourabh', email: 'sourabh@us24solutions.com', first_name: 'Sourabh', last_name: 'Sharma', role: 'employee', employee_id: 'US24-EMP01', phone: '+1 (800) 240-0101', color: '#2563eb' },
  { username: 'rohit', email: 'rohit@us24solutions.com', first_name: 'Rohit', last_name: 'Verma', role: 'employee', employee_id: 'US24-EMP02', phone: '+1 (800) 240-0102', color: '#06b6d4' },
  { username: 'gautam', email: 'gautam@us24solutions.com', first_name: 'Gautam', last_name: 'Patel', role: 'employee', employee_id: 'US24-EMP03', phone: '+1 (800) 240-0103', color: '#10b981' },
  { username: 'manish', email: 'manish@us24solutions.com', first_name: 'Manish', last_name: 'Gupta', role: 'employee', employee_id: 'US24-EMP04', phone: '+1 (800) 240-0104', color: '#f59e0b' },
  { username: 'jitendra', email: 'jitendra@us24solutions.com', first_name: 'Jitendra', last_name: 'Singh', role: 'employee', employee_id: 'US24-EMP05', phone: '+1 (800) 240-0105', color: '#8b5cf6' },
];

const TASKS = [
  { task_id: 'TSK-2026-001', category: 'credentialing', project_name: 'US24 Health Group', task_name: 'Medicare Provider Enrollment Revalidation', sub_plan: 'CMS 855I Individual Specialist Plan', insurance_name: 'Medicare Part B (Noridian)', assignee: 'sourabh', follow_up_type: 'call', follow_up_value: '+1 (800) 633-4227', status: 'In Progress', notes: 'Follow up on revalidation tracking #MED-99481; pending CAQH attestation verification.' },
  { task_id: 'TSK-2026-002', category: 'portal_creation', project_name: 'Metro Health Clinic', task_name: 'Availity Essentials Organization Admin Setup', sub_plan: 'Provider Multi-NPI Portal Access', insurance_name: 'Availity Multi-Payer Clearinghouse', assignee: 'rohit', follow_up_type: 'portal', follow_up_value: 'https://apps.availity.com/availity/web/public.elegant.login', status: 'Assigned', notes: 'Configure sub-accounts for billing analysts and link Tax ID 84-293819.' },
  { task_id: 'TSK-2026-003', category: 'era_eft', project_name: 'Pacific Coast Orthopedics', task_name: 'Electronic Remittance Advice (835) Routing Setup', sub_plan: 'Direct Deposit ACH Linking', insurance_name: 'Blue Cross Blue Shield California', assignee: 'gautam', follow_up_type: 'email', follow_up_value: 'edi.enrollment@bcbs.com', status: 'Pending Info', notes: 'Voided check and signed bank authorization letter submitted; awaiting bank verification callback.' },
  { task_id: 'TSK-2026-004', category: 'credentialing', project_name: 'Horizon Surgical Associates', task_name: 'Aetna Commercial In-Network Credentialing', sub_plan: 'Standard Commercial PPO Agreement', insurance_name: 'Aetna Health Care', assignee: 'manish', follow_up_type: 'call', follow_up_value: '+1 (888) 632-3862', status: 'Completed', notes: 'Contract counter-signed and active effective Sep 01, 2026. Provider ID #AET-77192.' },
  { task_id: 'TSK-2026-005', category: 'portal_creation', project_name: 'Austin Wellness Partners', task_name: 'UnitedHealthcare Provider Portal Account Activation', sub_plan: 'Optum ID & Link Setup', insurance_name: 'UnitedHealthcare / Optum', assignee: 'jitendra', follow_up_type: 'portal', follow_up_value: 'https://www.uhcprovider.com', status: 'In Progress', notes: 'Optum ID generated; two-step security questions configured for clinic billing team.' },
  { task_id: 'TSK-2026-006', category: 'era_eft', project_name: 'Trinity Family Practice', task_name: 'Cigna 835 ERA & EFT Direct Pay Enrollment', sub_plan: 'Electronic Funds Transfer Enrollment', insurance_name: 'Cigna Healthcare', assignee: 'sourabh', follow_up_type: 'email', follow_up_value: 'remittance@cigna.com', status: 'Assigned', notes: 'Submission pending practice manager digital signature via DocuSign.' },
  { task_id: 'TSK-2026-007', category: 'credentialing', project_name: 'Silverline Pediatrics', task_name: 'Medicaid State Plan Facility Credentialing', sub_plan: 'CHIP & Title XIX Medicaid Provider Enrollment', insurance_name: 'State Department of Health Medicaid', assignee: 'rohit', follow_up_type: 'call', follow_up_value: '+1 (800) 457-4584', status: 'In Progress', notes: 'Fingerprint background check completed; awaiting site inspection clearance.' },
];

async function seed() {
  console.log('[INFO] Starting US24 Solutions database seeding...');
  const db = await openDatabase(config.database);
  const users = {};

  for (const u of USERS) {
    const isAdmin = u.role === 'admin';
    const passwordHash = await makePassword(isAdmin ? 'admin123' : 'pass123');
    const existing = await db.get('SELECT id FROM auth_user WHERE username = ?', u.username);
    const id = existing
      ? Number(existing.id)
      : await insertUser(db, { username: u.username, email: u.email, firstName: u.first_name, lastName: u.last_name, password: passwordHash, isAdmin });
    await db.run('UPDATE auth_user SET password = ? WHERE id = ?', passwordHash, id);

    const profile = await getOrCreateProfile(db, id);
    Object.assign(profile, { role: u.role, employee_id: u.employee_id, phone: u.phone, avatar_color: u.color });
    await saveProfile(db, profile);
    users[u.username] = await getUserById(db, id);
    console.log(`  - User ready: ${u.username} (${u.first_name} ${u.last_name})`);
  }

  const admin = users.admin;
  for (const t of TASKS) {
    const assignee = users[t.assignee];
    const values = {
      category: t.category,
      project_name: t.project_name,
      task_name: t.task_name,
      sub_plan: t.sub_plan,
      insurance_name: t.insurance_name,
      assignee_id: assignee.id,
      created_by_id: admin.id,
      follow_up_type: t.follow_up_type,
      follow_up_value: t.follow_up_value,
      status: t.status,
      notes: t.notes,
    };
    const existing = await getTaskByTaskId(db, t.task_id);
    let taskPk;
    if (existing) {
      await updateTask(db, existing, values);
      taskPk = existing.id;
    } else {
      taskPk = await insertTask(db, { ...values, task_id: t.task_id });
    }
    console.log(`  - Task seeded: [${t.task_id}] ${t.task_name}`);

    if (!(await db.get('SELECT 1 AS found FROM tasks_tasklog WHERE task_id = ?', taskPk))) {
      await insertLog(db, {
        task_id: taskPk,
        updated_by_id: admin.id,
        previous_status: '',
        new_status: t.status,
        remarks: `Initial task creation and assignment to ${fullName(assignee)}.`,
      });
      if (['In Progress', 'Pending Info', 'Completed'].includes(t.status)) {
        await insertLog(db, {
          task_id: taskPk,
          updated_by_id: assignee.id,
          previous_status: 'Assigned',
          new_status: t.status,
          remarks: `Progress updated by ${fullName(assignee)}: ${t.notes}`,
        });
      }
    }
  }

  await db.close();
  console.log('[SUCCESS] Seeding completed successfully! US24 Solutions data ready.');
}

await seed();
