// Task and task-log queries. `q` is the database or an open transaction (same interface).
import { likeContains, pyInt } from '../lib/py.js';
import { currentYear, nowDb, todayUtc } from '../lib/time.js';
import { isAdmin } from './users.js';

export const CATEGORY_CHOICES = Object.freeze({
  credentialing: 'Credentialing',
  portal_creation: 'Portal Creation',
  era_eft: 'ERA/EFT',
  password_reset: 'Password Reset',
  portal_unblock: 'Portal Unblock',
  payment_posting: 'Payment Posting',
  general: 'General',
});

export const STATUS_CHOICES = Object.freeze([
  'Request',
  'Pending',
  'Approved',
  'Panel closed',
  'Assigned',
  'In Progress',
  'In Process',
  'Pending Info',
  'Completed',
  'Cancelled',
]);

export const FOLLOW_UP_CHOICES = Object.freeze({ call: 'Call', email: 'Email', portal: 'Portal' });

export const MOC_CHOICES = Object.freeze(['call', 'email', 'fax']);

/** Task types whose approval must record the portal User ID and Password (portal creation also needs the link). */
export const PORTAL_CREDENTIAL_CATEGORIES = Object.freeze(['portal_creation', 'password_reset']);

const TASK_COLUMNS = [
  'task_id', 'category', 'project_name', 'task_name', 'sub_plan', 'insurance_name', 'creation_date',
  'follow_up_type', 'follow_up_value', 'status', 'notes', 'created_at', 'updated_at', 'assignee_id',
  'created_by_id', 'provider_name', 'early_start_date', 'group_ptan', 'individual_ptan',
  'provider_effective_date', 'attachment', 'follow_up_days', 'follow_up_due_date', 'portal_link',
  'portal_password', 'portal_user_id', 'work_date',
];

const LOG_COLUMNS = [
  'previous_status', 'new_status', 'created_at', 'reassigned_to_id', 'task_id', 'updated_by_id', 'attachment',
  'follow_up_days', 'moc', 'portal_link', 'portal_password', 'portal_user_id', 'tat', 'work_date', 'remarks',
];

const placeholders = (n) => Array.from({ length: n }, () => '?').join(', ');

function taskDefaults() {
  return {
    task_id: '',
    category: 'credentialing',
    project_name: '',
    task_name: '',
    provider_name: '',
    provider_effective_date: null,
    group_ptan: '',
    individual_ptan: '',
    early_start_date: null,
    sub_plan: '',
    insurance_name: '',
    creation_date: todayUtc(),
    assignee_id: null,
    created_by_id: null,
    follow_up_type: 'call',
    follow_up_value: '',
    status: 'Request',
    notes: '',
    attachment: '',
    portal_link: '',
    portal_user_id: '',
    portal_password: '',
    work_date: null,
    follow_up_days: null,
    follow_up_due_date: null,
  };
}

async function taskIdTaken(q, taskId, excludePk) {
  const row =
    excludePk === null
      ? await q.get('SELECT 1 AS found FROM tasks_task WHERE task_id = ?', taskId)
      : await q.get('SELECT 1 AS found FROM tasks_task WHERE task_id = ? AND id <> ?', taskId, excludePk);
  return Boolean(row);
}

/** Next free 'TSK-<year>-NNN' id: one past the highest number used this year. */
export async function generateTaskId(q, excludePk = null) {
  const year = currentYear();
  const pattern = new RegExp(`^TSK-${year}-(\\d+)`);
  let maxNum = 0;
  for (const { task_id: existing } of await q.all('SELECT task_id FROM tasks_task')) {
    const match = pattern.exec(existing ?? '');
    if (match) maxNum = Math.max(maxNum, Number.parseInt(match[1], 10));
  }
  let nextNum = maxNum + 1;
  const format = (n) => `TSK-${year}-${String(n).padStart(3, '0')}`;
  while (await taskIdTaken(q, format(nextNum), excludePk)) nextNum += 1;
  return { taskId: format(nextNum), nextNum };
}

/** Task.save(): keep a non-empty unique task_id, otherwise assign a generated one. */
export async function resolveTaskId(q, taskId, pk = null) {
  if (!taskId || (await taskIdTaken(q, taskId, pk))) return (await generateTaskId(q, pk)).taskId;
  return taskId;
}

function lastParam(query, key) {
  const value = query[key];
  return Array.isArray(value) ? value.at(-1) : value;
}

/** WHERE conditions for the task list filters (?category, ?status, ?assignee_id, ?assignee, ?search). */
function taskFilters(q, query, user = null) {
  const where = [];
  const params = [];

  // Strict tenant/user isolation: non-admin employees can ONLY view tasks assigned to them (or unassigned tasks they created)
  if (user && !isAdmin(user)) {
    where.push('(t.assignee_id = ? OR (t.assignee_id IS NULL AND t.created_by_id = ?))');
    params.push(user.id, user.id);
  } else {
    const assigneeId = lastParam(query, 'assignee_id');
    if (assigneeId) {
      const id = pyInt(assigneeId);
      if (Number.isSafeInteger(id)) {
        where.push('t.assignee_id = ?');
        params.push(id);
      } else {
        where.push('1 = 0');
      }
    }
    const assignee = lastParam(query, 'assignee');
    if (assignee) {
      where.push(`t.assignee_id IN (SELECT id FROM auth_user WHERE ${q.iexact('username')})`);
      params.push(q.iexactValue(assignee));
    }
  }

  const category = lastParam(query, 'category');
  if (category && category !== 'all') {
    where.push(q.iexact('t.category'));
    params.push(q.iexactValue(category));
  }
  const status = lastParam(query, 'status');
  if (status && status !== 'all') {
    where.push(q.iexact('t.status'));
    params.push(q.iexactValue(status));
  }
  const search = lastParam(query, 'search');
  if (search) {
    const value = likeContains(search);
    const columns = ['t.task_id', 't.project_name', 't.task_name', 't.insurance_name', 't.sub_plan'];
    where.push(`(${columns.map((c) => q.icontains(c)).join(' OR ')})`);
    params.push(...columns.map(() => value));
  }
  return { where, params };
}

export async function listTasks(q, query = {}, user = null) {
  const { where, params } = taskFilters(q, query, user);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return q.all(`SELECT t.* FROM tasks_task t ${clause} ORDER BY t.created_at DESC, t.id DESC`, ...params);
}

/** Detail lookup; honors the same list/permission filters from the query string and user context. */
export async function findTask(q, pk, query = {}, user = null) {
  const id = pyInt(pk);
  if (!Number.isSafeInteger(id)) return null;
  const { where, params } = taskFilters(q, query, user);
  return q.get(`SELECT t.* FROM tasks_task t WHERE ${['t.id = ?', ...where].join(' AND ')}`, id, ...params);
}

export async function getTaskRow(q, id) {
  return q.get('SELECT * FROM tasks_task WHERE id = ?', id);
}

export async function getTaskByTaskId(q, taskId) {
  return q.get('SELECT * FROM tasks_task WHERE task_id = ?', taskId);
}

export async function listTasksForAssignee(q, userId) {
  return q.all('SELECT * FROM tasks_task WHERE assignee_id = ? ORDER BY created_at DESC, id DESC', userId);
}

export async function insertTask(q, values) {
  const row = { ...taskDefaults(), ...values };
  if (!row.attachment) row.attachment = '';
  row.task_id = await resolveTaskId(q, row.task_id, null);
  row.created_at = row.updated_at = nowDb();
  const inserted = await q.get(
    `INSERT INTO tasks_task (${TASK_COLUMNS.join(', ')}) VALUES (${placeholders(TASK_COLUMNS.length)}) RETURNING id`,
    ...TASK_COLUMNS.map((column) => row[column]),
  );
  return Number(inserted.id);
}

/** Task.save() on an existing row: writes every column and refreshes updated_at. */
export async function updateTask(q, current, changes) {
  const row = { ...current, ...changes };
  if (!row.attachment) row.attachment = '';
  row.task_id = await resolveTaskId(q, row.task_id, current.id);
  row.updated_at = nowDb();
  const columns = TASK_COLUMNS.filter((column) => column !== 'created_at');
  await q.run(
    `UPDATE tasks_task SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    ...columns.map((column) => row[column]),
    current.id,
  );
}

export async function deleteTask(db, id) {
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM tasks_tasklog WHERE task_id = ?', id);
    await tx.run('DELETE FROM tasks_task WHERE id = ?', id);
  });
}

export async function insertLog(q, values) {
  const row = {
    previous_status: '',
    new_status: '',
    remarks: '',
    attachment: '',
    reassigned_to_id: null,
    updated_by_id: null,
    moc: '',
    tat: '',
    work_date: null,
    follow_up_days: null,
    portal_link: '',
    portal_user_id: '',
    portal_password: '',
    ...values,
    created_at: nowDb(),
  };
  if (!row.attachment) row.attachment = '';
  const inserted = await q.get(
    `INSERT INTO tasks_tasklog (${LOG_COLUMNS.join(', ')}) VALUES (${placeholders(LOG_COLUMNS.length)}) RETURNING id`,
    ...LOG_COLUMNS.map((column) => row[column]),
  );
  return Number(inserted.id);
}

export async function getLogRow(q, id) {
  return q.get('SELECT * FROM tasks_tasklog WHERE id = ?', id);
}

export async function recentLogs(q, limit) {
  return q.all('SELECT * FROM tasks_tasklog ORDER BY created_at DESC, id DESC LIMIT ?', limit);
}

/** Logs for many tasks, newest first. */
export async function logsForTasks(q, taskIds) {
  const logs = [];
  for (let i = 0; i < taskIds.length; i += 500) {
    const chunk = taskIds.slice(i, i + 500);
    logs.push(
      ...(await q.all(
        `SELECT * FROM tasks_tasklog WHERE task_id IN (${placeholders(chunk.length)}) ORDER BY created_at DESC, id DESC`,
        ...chunk,
      )),
    );
  }
  return logs;
}

/** COUNT(*) of tasks matching a condition. */
export async function countTasks(q, where = '1 = 1', ...params) {
  return Number((await q.get(`SELECT COUNT(*) AS n FROM tasks_task WHERE ${where}`, ...params)).n);
}
