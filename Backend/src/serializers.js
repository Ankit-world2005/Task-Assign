// JSON shapes identical to the DRF serializers the React app was built against.
import { toApiDatetime } from './lib/time.js';
import { logsForTasks } from './models/tasks.js';
import { displayName } from './models/users.js';

export function serializeUser(user) {
  const data = {
    id: user.id,
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    full_name: displayName(user),
  };
  // DRF left "profile" out entirely for a user without one.
  if (user.profile) {
    data.profile = {
      role: user.profile.role,
      employee_id: user.profile.employee_id,
      phone: user.profile.phone,
      department: user.profile.department,
      avatar_color: user.profile.avatar_color,
    };
  }
  data.is_active = user.is_active;
  data.date_joined = toApiDatetime(user.date_joined);
  data.last_login = toApiDatetime(user.last_login);
  return data;
}

/** id -> { username, first_name, last_name } for resolving names on tasks and logs. */
export async function userNames(q) {
  return new Map((await q.all('SELECT id, username, first_name, last_name FROM auth_user')).map((u) => [u.id, u]));
}

const nameOf = (names, id) => (id === null || id === undefined ? null : names.get(id) ?? null);

export function serializeLog(log, names) {
  const author = nameOf(names, log.updated_by_id);
  const reassigned = nameOf(names, log.reassigned_to_id);
  return {
    id: log.id,
    task: log.task_id,
    updated_by: log.updated_by_id,
    updated_by_name: author ? displayName(author) : 'System',
    previous_status: log.previous_status,
    new_status: log.new_status,
    remarks: log.remarks,
    attachment: log.attachment,
    reassigned_to: log.reassigned_to_id,
    reassigned_to_name: reassigned ? displayName(reassigned) : null,
    moc: log.moc,
    tat: log.tat,
    work_date: log.work_date || null,
    follow_up_days: log.follow_up_days,
    portal_link: log.portal_link,
    portal_user_id: log.portal_user_id,
    portal_password: log.portal_password,
    created_at: toApiDatetime(log.created_at),
  };
}

function serializeTaskRow(task, logs, names) {
  const assignee = nameOf(names, task.assignee_id);
  const creator = nameOf(names, task.created_by_id);
  return {
    id: task.id,
    task_id: task.task_id,
    category: task.category,
    project_name: task.project_name,
    task_name: task.task_name,
    provider_name: task.provider_name,
    provider_effective_date: task.provider_effective_date || null,
    group_ptan: task.group_ptan,
    individual_ptan: task.individual_ptan,
    early_start_date: task.early_start_date || null,
    sub_plan: task.sub_plan,
    insurance_name: task.insurance_name,
    creation_date: task.creation_date || null,
    assignee: task.assignee_id,
    assignee_name: assignee ? displayName(assignee) : 'Unassigned',
    created_by: task.created_by_id,
    created_by_name: creator ? displayName(creator) : 'Admin',
    follow_up_type: task.follow_up_type,
    follow_up_value: task.follow_up_value,
    status: task.status,
    notes: task.notes,
    attachment: task.attachment,
    portal_link: task.portal_link,
    portal_user_id: task.portal_user_id,
    portal_password: task.portal_password,
    work_date: task.work_date || null,
    follow_up_days: task.follow_up_days,
    follow_up_due_date: task.follow_up_due_date || null,
    created_at: toApiDatetime(task.created_at),
    updated_at: toApiDatetime(task.updated_at),
    logs: logs.map((log) => serializeLog(log, names)),
  };
}

/** Serializes task rows with their nested logs (newest first). */
export async function serializeTasks(q, tasks) {
  if (!tasks.length) return [];
  const names = await userNames(q);
  const logsByTask = new Map();
  for (const log of await logsForTasks(q, tasks.map((t) => t.id))) {
    if (!logsByTask.has(log.task_id)) logsByTask.set(log.task_id, []);
    logsByTask.get(log.task_id).push(log);
  }
  return tasks.map((task) => serializeTaskRow(task, logsByTask.get(task.id) ?? [], names));
}

export async function serializeTask(q, task) {
  return (await serializeTasks(q, [task]))[0];
}
