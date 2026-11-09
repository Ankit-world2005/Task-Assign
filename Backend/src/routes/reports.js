// /api/stats/, /api/profile/dashboard/, /api/export-csv/
import express from 'express';
import { route } from '../http.js';
import { formatCsvRow } from '../import/csv.js';
import { todayUtc, toUsDate } from '../lib/time.js';
import {
  CATEGORY_CHOICES,
  FOLLOW_UP_CHOICES,
  countTasks,
  listTasks,
  listTasksForAssignee,
  recentLogs,
} from '../models/tasks.js';
import { displayName, fullName, listWorkloadUsers } from '../models/users.js';
import { serializeLog, serializeTasks, serializeUser, userNames } from '../serializers.js';

const ACTIVE_STATUSES = ['Request', 'Pending', 'Assigned', 'In Progress', 'Pending Info'];
const DONE_STATUSES = ['Approved', 'Panel closed', 'Completed'];
const PENDING_STATUSES = ['Pending', 'Pending Info', 'In Progress', 'In Process'];

const placeholders = (values) => values.map(() => '?').join(', ');
const pad = (n) => String(n).padStart(2, '0');

// A cell starting with = + - @ (or tab/CR) would run as a formula when the CSV is opened in Excel.
const csvSafe = (value) => (typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export function reportRoutes({ db }) {
  const router = express.Router();

  // Dashboard analytics: KPI counts, category totals, per-employee workload, latest activity.
  route(router, '/stats', {
    get: async (req, res) => {
      const total = await countTasks(db);
      const completed = await countTasks(db, 'status = ?', 'Completed');

      const workloadRows = await db.all(
        `SELECT assignee_id, COUNT(*) AS total,
           SUM(CASE WHEN status IN (${placeholders(ACTIVE_STATUSES)}) THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status IN (${placeholders(DONE_STATUSES)}) THEN 1 ELSE 0 END) AS completed
         FROM tasks_task WHERE assignee_id IS NOT NULL GROUP BY assignee_id`,
        ...ACTIVE_STATUSES,
        ...DONE_STATUSES,
      );
      const workload = new Map(workloadRows.map((row) => [row.assignee_id, row]));
      const assignees = (await listWorkloadUsers(db)).map((user) => {
        const stats = workload.get(user.id);
        return {
          id: user.id,
          name: displayName(user),
          username: user.username,
          total: Number(stats?.total ?? 0),
          active: Number(stats?.active ?? 0),
          completed: Number(stats?.completed ?? 0),
          avatar_color: user.profile ? user.profile.avatar_color : '#2563eb',
        };
      });

      const names = await userNames(db);
      res.json({
        kpis: {
          total,
          in_progress: await countTasks(db, 'status = ?', 'In Progress'),
          completed,
          pending: await countTasks(db, 'status IN (?, ?, ?)', 'Pending', 'Pending Info', 'Request'),
          assigned: await countTasks(db, 'status = ?', 'Assigned'),
          completion_rate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
        },
        categories: {
          credentialing: await countTasks(db, 'category = ?', 'credentialing'),
          portal_creation: await countTasks(db, 'category = ?', 'portal_creation'),
          era_eft: await countTasks(db, 'category = ?', 'era_eft'),
          payment_posting: await countTasks(db, 'category = ?', 'payment_posting'),
          general: await countTasks(db, 'category = ?', 'general'),
        },
        assignees,
        recent_logs: (await recentLogs(db, 8)).map((log) => serializeLog(log, names)),
      });
    },
  });

  // The signed-in user's own tasks: total / new today / older open / completed / pending.
  route(router, '/profile/dashboard', {
    get: async (req, res) => {
      const user = req.user;
      const today = todayUtc();
      const tasks = await listTasksForAssignee(db, user.id);
      const serialized = await serializeTasks(db, tasks);
      const pick = (test) => serialized.filter((_, i) => test(tasks[i]));
      const isDone = (t) => DONE_STATUSES.includes(t.status);
      const groups = {
        total: serialized,
        new: pick((t) => t.creation_date === today && !isDone(t)),
        old: pick((t) => t.creation_date < today && !isDone(t)),
        completed: pick(isDone),
        pending: pick((t) => PENDING_STATUSES.includes(t.status)),
      };

      res.json({
        user: serializeUser(user),
        counts: Object.fromEntries(Object.entries(groups).map(([key, list]) => [key, list.length])),
        tasks: groups,
      });
    },
  });

  route(router, '/export-csv', {
    get: async (req, res) => {
      const tasks = await listTasks(db, { category: req.query.category });
      const names = await userNames(db);
      const lines = [
        formatCsvRow([
          'Task ID', 'Category', 'Project Name', 'Task Name', 'Provider Name',
          'Provider Effective Date', 'G-PTAN ID', 'P-PTAN ID', 'Early Start Date',
          'Sub Plan', 'Insurance Name', 'Creation Date',
          'Assignee', 'Follow Up Type', 'Follow Up Value', 'Status',
        ]),
      ];
      for (const t of tasks) {
        const assignee = t.assignee_id === null ? null : names.get(t.assignee_id);
        lines.push(
          formatCsvRow([
            t.task_id,
            CATEGORY_CHOICES[t.category] ?? t.category,
            t.project_name,
            t.task_name,
            t.provider_name || '',
            toUsDate(t.provider_effective_date),
            t.group_ptan || '',
            t.individual_ptan || '',
            toUsDate(t.early_start_date),
            t.sub_plan,
            t.insurance_name,
            toUsDate(t.creation_date),
            assignee ? fullName(assignee) : 'Unassigned',
            FOLLOW_UP_CHOICES[t.follow_up_type] ?? t.follow_up_type,
            t.follow_up_value,
            t.status,
          ].map(csvSafe)),
        );
      }
      const now = new Date();
      const stamp =
        `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_` +
        `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="us24_tasks_${stamp}.csv"`);
      res.send(Buffer.from(lines.join(''), 'utf8'));
    },
  });

  return router;
}
