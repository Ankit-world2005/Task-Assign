// User and profile queries. `q` is the database or an open transaction (same interface).
import { checkPassword, makePassword } from '../lib/passwords.js';
import { likeContains } from '../lib/py.js';
import { nowDb } from '../lib/time.js';

const USER_SELECT = `SELECT u.id, u.password, u.last_login, u.is_superuser, u.username, u.last_name, u.email,
    u.is_staff, u.is_active, u.date_joined, u.first_name,
    p.id AS profile_id, p.role AS profile_role, p.employee_id AS profile_employee_id,
    p.phone AS profile_phone, p.department AS profile_department, p.avatar_color AS profile_avatar_color,
    p.current_otp AS profile_current_otp, p.otp_created_at AS profile_otp_created_at
  FROM auth_user u LEFT JOIN tasks_userprofile p ON p.user_id = u.id`;

export const PROFILE_DEFAULTS = Object.freeze({
  role: 'employee',
  employee_id: '',
  phone: '',
  department: 'Operations & Enrollment',
  avatar_color: '#2563eb',
});

/** User ids are 32-bit integers; anything outside that range matches no user. */
export const isUserId = (id) => Number.isSafeInteger(id) && id >= -2147483648 && id <= 2147483647;

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    password: row.password,
    last_login: row.last_login,
    is_superuser: Boolean(row.is_superuser),
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    is_staff: Boolean(row.is_staff),
    is_active: Boolean(row.is_active),
    date_joined: row.date_joined,
    profile:
      row.profile_id === null || row.profile_id === undefined
        ? null
        : {
            id: row.profile_id,
            role: row.profile_role,
            employee_id: row.profile_employee_id,
            phone: row.profile_phone,
            department: row.profile_department,
            avatar_color: row.profile_avatar_color,
            current_otp: row.profile_current_otp,
            otp_created_at: row.profile_otp_created_at,
          },
  };
}

export async function getUserById(q, id) {
  if (!isUserId(id)) return null;
  return hydrate(await q.get(`${USER_SELECT} WHERE u.id = ?`, id));
}

/** Login lookup: email, username or employee ID, case-insensitive. */
export async function findUserByLogin(q, identifier) {
  const value = q.iexactValue(identifier);
  return hydrate(
    await q.get(
      `${USER_SELECT} WHERE ${q.iexact('u.email')} OR ${q.iexact('u.username')} OR ${q.iexact('p.employee_id')}
       ORDER BY u.id LIMIT 1`,
      value,
      value,
      value,
    ),
  );
}

/** Spreadsheet assignee match: robust case-insensitive matching on username, names, email, employee ID or sub-tokens. */
export async function findUserByFuzzyName(q, name) {
  if (!name || typeof name !== 'string') return null;
  const clean = name.trim();
  if (!clean || ['none', 'unassigned', '-', 'n/a', 'na'].includes(clean.toLowerCase())) return null;

  // 1. Direct contains check
  const value = likeContains(clean);
  const direct = await q.get(
    `${USER_SELECT} WHERE ${q.icontains('u.username')} OR ${q.icontains('u.first_name')}
       OR ${q.icontains('u.last_name')} OR ${q.icontains('u.email')} OR ${q.icontains('p.employee_id')}
     ORDER BY u.id LIMIT 1`,
    value,
    value,
    value,
    value,
    value,
  );
  if (direct) return hydrate(direct);

  // 2. Tokenized search: if clean has multiple words/tokens (e.g. "Sohail Khan", "Dr. Rohit", "Manish / QA")
  const tokens = clean.split(/[\s,/_.-]+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    const tVal = likeContains(token);
    const byToken = await q.get(
      `${USER_SELECT} WHERE ${q.icontains('u.username')} OR ${q.icontains('u.first_name')}
         OR ${q.icontains('u.last_name')} OR ${q.icontains('u.email')}
       ORDER BY u.id LIMIT 1`,
      tVal,
      tVal,
      tVal,
      tVal,
    );
    if (byToken) return hydrate(byToken);
  }

  // 3. Reverse check: see if any existing user's username or first_name is contained inside `clean`
  const allUsers = await q.all(`${USER_SELECT}`);
  const cleanLower = clean.toLowerCase();
  for (const row of allUsers) {
    const u = hydrate(row);
    if (u.username && cleanLower.includes(u.username.toLowerCase())) return u;
    if (u.first_name && u.first_name.length >= 3 && cleanLower.includes(u.first_name.toLowerCase())) return u;
    if (u.email && cleanLower.includes(u.email.toLowerCase())) return u;
  }

  return null;
}

export async function listUsers(q) {
  return (await q.all(`${USER_SELECT} ORDER BY u.username`)).map(hydrate);
}

/** Users in the dashboard workload table: employees or non-superusers. */
export async function listWorkloadUsers(q) {
  return (await q.all(`${USER_SELECT} WHERE p.role = ? OR u.is_superuser = ? ORDER BY u.id`, 'employee', false)).map(hydrate);
}

export async function usernameTaken(q, username) {
  return Boolean(await q.get(`SELECT 1 AS found FROM auth_user WHERE ${q.iexact('username')} LIMIT 1`, q.iexactValue(username)));
}

export async function emailTaken(q, email, excludeId = null) {
  const value = q.iexactValue(email);
  if (excludeId === null) {
    return Boolean(await q.get(`SELECT 1 AS found FROM auth_user WHERE ${q.iexact('email')} LIMIT 1`, value));
  }
  return Boolean(
    await q.get(`SELECT 1 AS found FROM auth_user WHERE ${q.iexact('email')} AND id <> ? LIMIT 1`, value, excludeId),
  );
}

/** Full name ("First Last"); may be an empty string. */
export function fullName(user) {
  return `${user.first_name} ${user.last_name}`.trim();
}

/** Name shown in the UI: full name, falling back to the username. */
export function displayName(user) {
  return fullName(user) || user.username;
}

export function isAdmin(user) {
  return Boolean(user && (user.is_superuser || user.is_staff || user.profile?.role === 'admin'));
}

export async function getOrCreateProfile(q, userId) {
  const existing = await q.get('SELECT * FROM tasks_userprofile WHERE user_id = ?', userId);
  if (existing) return { ...existing };
  const p = PROFILE_DEFAULTS;
  await q.run(
    `INSERT INTO tasks_userprofile (role, employee_id, phone, department, avatar_color, current_otp, user_id, otp_created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)`,
    p.role,
    p.employee_id,
    p.phone,
    p.department,
    p.avatar_color,
    userId,
  );
  return { ...(await q.get('SELECT * FROM tasks_userprofile WHERE user_id = ?', userId)) };
}

export async function saveProfile(q, profile) {
  await q.run(
    `UPDATE tasks_userprofile SET role = ?, employee_id = ?, phone = ?, department = ?, avatar_color = ?,
       current_otp = ?, otp_created_at = ? WHERE id = ?`,
    profile.role,
    profile.employee_id,
    profile.phone,
    profile.department,
    profile.avatar_color,
    profile.current_otp,
    profile.otp_created_at,
    profile.id,
  );
}

export async function saveUser(q, user) {
  await q.run(
    `UPDATE auth_user SET password = ?, last_login = ?, is_superuser = ?, username = ?, last_name = ?, email = ?,
       is_staff = ?, is_active = ?, date_joined = ?, first_name = ? WHERE id = ?`,
    user.password,
    user.last_login,
    user.is_superuser,
    user.username,
    user.last_name,
    user.email,
    user.is_staff,
    user.is_active,
    user.date_joined,
    user.first_name,
    user.id,
  );
}

export async function insertUser(q, { username, email, firstName = '', lastName = '', password, isActive = true, isAdmin = false }) {
  const row = await q.get(
    `INSERT INTO auth_user (password, last_login, is_superuser, username, last_name, email, is_staff, is_active, date_joined, first_name)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    password,
    isAdmin,
    username,
    lastName,
    email,
    isAdmin,
    isActive,
    nowDb(),
    firstName,
  );
  return Number(row.id);
}

/** Checks a password and re-hashes it if the stored iteration count is outdated. */
export async function verifyUserPassword(q, user, raw) {
  const { valid, mustUpdate } = await checkPassword(raw, user.password);
  if (valid && mustUpdate) {
    user.password = await makePassword(raw);
    await q.run('UPDATE auth_user SET password = ? WHERE id = ?', user.password, user.id);
  }
  return valid;
}

/** Deletes a user cleanly: drops profile and sessions, and clears task/log user references. */
export async function deleteUser(db, userId) {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE tasks_task SET assignee_id = NULL WHERE assignee_id = ?', userId);
    await tx.run('UPDATE tasks_task SET created_by_id = NULL WHERE created_by_id = ?', userId);
    await tx.run('UPDATE tasks_tasklog SET updated_by_id = NULL WHERE updated_by_id = ?', userId);
    await tx.run('UPDATE tasks_tasklog SET reassigned_to_id = NULL WHERE reassigned_to_id = ?', userId);
    await tx.run('DELETE FROM tasks_userprofile WHERE user_id = ?', userId);
    for (const table of ['auth_user_groups', 'auth_user_user_permissions', 'django_admin_log']) {
      if (await tx.hasTable(table)) await tx.run(`DELETE FROM ${table} WHERE user_id = ?`, userId);
    }
    await tx.run('DELETE FROM node_session WHERE user_id = ?', userId);
    await tx.run('DELETE FROM auth_user WHERE id = ?', userId);
  });
}
