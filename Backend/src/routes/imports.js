// /api/import-excel/ (and the /api/import-csv/ alias): create or update tasks from a spreadsheet.
import express from 'express';
import multer from 'multer';
import { HttpError, route } from '../http.js';
import { extractRecords } from '../import/extract.js';
import { isTruthy, pyStr } from '../lib/py.js';
import { makeIsoDate } from '../lib/time.js';
import { getTaskByTaskId, insertTask, updateTask } from '../models/tasks.js';
import { findUserByFuzzyName, isAdmin } from '../models/users.js';

const STATUS_MAP = {
  pending: 'Pending',
  approved: 'Approved',
  'panel closed': 'Panel closed',
  panelclosed: 'Panel closed',
  assigned: 'Assigned',
  'in progress': 'In Progress',
  inprogress: 'In Progress',
  'pending info': 'Pending Info',
  pendinginfo: 'Pending Info',
  completed: 'Completed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
};

const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_LONG = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// Year, month and day patterns for ISO, US/EU slash/dash, and month-name date parsing.
const Y = '(\\d{4})';
const M = '(1[0-2]|0[1-9]|[1-9])';
const D = '(3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])';

// Accepted date formats, tried in order: [pattern, (match) => [year, month, day]].
const DATE_FORMATS = [
  [new RegExp(`^${Y}-${M}-${D}$`), (m) => [m[1], m[2], m[3]]], // 2026-01-15
  [new RegExp(`^${M}/${D}/${Y}$`), (m) => [m[3], m[1], m[2]]], // 01/15/2026
  [new RegExp(`^${D}/${M}/${Y}$`), (m) => [m[3], m[2], m[1]]], // 15/01/2026
  [new RegExp(`^${M}-${D}-${Y}$`), (m) => [m[3], m[1], m[2]]], // 01-15-2026
  [new RegExp(`^${D}-${M}-${Y}$`), (m) => [m[3], m[2], m[1]]], // 15-01-2026
  [new RegExp(`^${Y}/${M}/${D}$`), (m) => [m[1], m[2], m[3]]], // 2026/01/15
  [new RegExp(`^(${MONTHS_SHORT.join('|')})\\s+${D},\\s+${Y}$`, 'i'), (m) => [m[3], MONTHS_SHORT.indexOf(m[1].toLowerCase()) + 1, m[2]]], // Jan 15, 2026
  [new RegExp(`^(${MONTHS_LONG.join('|')})\\s+${D},\\s+${Y}$`, 'i'), (m) => [m[3], MONTHS_LONG.indexOf(m[1].toLowerCase()) + 1, m[2]]], // January 15, 2026
];

function parseDateValue(value) {
  if (!isTruthy(value)) return null;
  if (value instanceof Date) return makeIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  const text = pyStr(value).trim();
  if (!text || ['none', 'null', '-', 'n/a'].includes(text.toLowerCase())) return null;
  const datePart = text.split('T')[0].trim();
  for (const [pattern, pick] of DATE_FORMATS) {
    const match = pattern.exec(datePart);
    if (!match) continue;
    const [year, month, day] = pick(match).map(Number);
    const iso = makeIsoDate(year, month, day);
    if (iso) return iso;
  }
  return null;
}

/** The cell's text (stripped), or the fallback when the cell is empty. */
const textOf = (row, key, fallback = '') => pyStr(isTruthy(row.get(key)) ? row.get(key) : fallback).trim();

function categoryOf(row, defaultCategory) {
  if (defaultCategory && defaultCategory.toLowerCase().trim() === 'payment_posting') {
    return 'payment_posting';
  }
  // Auto-detect payment posting by column presence
  if (
    row.has('num_files_ppt') ||
    row.has('denials_ss') ||
    row.has('time_by_manish') ||
    row.has('file_name') ||
    row.has('remaining') ||
    row.has('approx_time_min') ||
    row.has('final_time_user')
  ) {
    return 'payment_posting';
  }
  const categoryCell = row.has('category') ? row.get('category') : (row.has('task_type') ? row.get('task_type') : (defaultCategory || 'credentialing'));
  const raw = pyStr(categoryCell)
    .toLowerCase()
    .trim()
    .replaceAll(' ', '_')
    .replaceAll('/', '_');
  if (raw.includes('portal')) return 'portal_creation';
  if (raw.includes('era') || raw.includes('eft')) return 'era_eft';
  if (raw.includes('payment') || raw.includes('posting') || raw.includes('ppt')) return 'payment_posting';
  if (raw.includes('general')) return 'general';
  if (defaultCategory) return defaultCategory;
  return 'credentialing';
}

function followUpTypeOf(row) {
  const raw = textOf(row, 'follow_up_type', 'call').toLowerCase();
  if (raw.includes('mail')) return 'email';
  if (raw.includes('portal') || raw.includes('web')) return 'portal';
  return 'call';
}

function statusOf(row) {
  const raw = textOf(row, 'status', 'Assigned');
  return STATUS_MAP[raw.toLowerCase()] ?? (raw ? 'Assigned' : 'Pending');
}

/** Each row is saved on its own, as before (rows saved before a failing row stay saved). */
async function importRows(db, records, creator, defaultCategory) {
  for (const row of records) {
    const rawTaskId = row.get('task_id');
    const rawText = rawTaskId === null || rawTaskId === undefined ? '' : pyStr(rawTaskId).trim();
    const taskId = rawText && rawText.toLowerCase() !== 'none' ? rawText : '';

    const assigneeName = textOf(row, 'assignee');
    const assignee =
      assigneeName && !['none', 'unassigned', '-', ''].includes(assigneeName.toLowerCase())
        ? await findUserByFuzzyName(db, assigneeName)
        : null;

    const values = {
      category: categoryOf(row, defaultCategory),
      project_name: textOf(row, 'project_name', 'US24 Solution Project'),
      task_name: textOf(row, 'task_name', 'Standard Task'),
      sub_plan: textOf(row, 'sub_plan'),
      insurance_name: textOf(row, 'insurance_name', 'General Payer'),
      provider_name: textOf(row, 'provider_name'),
      group_ptan: textOf(row, 'group_ptan'),
      individual_ptan: textOf(row, 'individual_ptan'),
      follow_up_type: followUpTypeOf(row),
      follow_up_value: textOf(row, 'follow_up_value') || textOf(row, 'remarks'),
      status: statusOf(row),
      assignee_id: assignee?.id ?? null,
    };
    const earlyStart = parseDateValue(row.get('early_start_date'));
    const effective = parseDateValue(row.get('provider_effective_date'));
    const created = parseDateValue(row.get('creation_date'));
    const notes = textOf(row, 'notes') || textOf(row, 'remarks');
    if (earlyStart) values.early_start_date = earlyStart;
    if (effective) values.provider_effective_date = effective;
    if (created) values.creation_date = created;
    if (notes) values.notes = notes;

    const existing = taskId ? await getTaskByTaskId(db, taskId) : null;
    const isPaymentPosting = values.category === 'payment_posting';
    if (isPaymentPosting) {
      const taskTypeText = textOf(row, 'task_type') || textOf(row, 'task_name') || 'Payment Posting';
      const meta = {
        file_name: textOf(row, 'file_name'),
        num_files_ppt: textOf(row, 'num_files_ppt'),
        denials_ss: textOf(row, 'denials_ss'),
        remaining: textOf(row, 'remaining'),
        approx_time_min: textOf(row, 'approx_time_min'),
        final_time_user: textOf(row, 'final_time_user'),
        remarks: textOf(row, 'remarks') || textOf(row, 'notes'),
        assigned_user: assigneeName || (assignee ? (assignee.full_name || assignee.username) : ''),
        sup_qa: textOf(row, 'sup_qa'),
        time_by_manish: textOf(row, 'time_by_manish'),
      };
      values.notes = JSON.stringify(meta);
      values.insurance_name = textOf(row, 'file_name') || 'Payment Posting';
      values.task_name = taskTypeText;
      if (meta.sup_qa) values.follow_up_value = meta.sup_qa;
    }
    if (existing) {
      await db.transaction((tx) => updateTask(tx, existing, values));
    } else {
      await db.transaction((tx) => insertTask(tx, { ...values, task_id: taskId, created_by_id: creator?.id ?? null }));
    }
  }
}

export function importRoutes({ db, logger }) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).any();

  const handler = async (req, res) => {
    const file = (req.files ?? []).filter((f) => f.fieldname === 'file').at(-1);
    if (!file) return res.status(400).json({ detail: 'No spreadsheet file uploaded.' });

    let records;
    try {
      records = await extractRecords({ filename: file.originalname ?? '', buffer: file.buffer });
    } catch (err) {
      logger.error(`Error extracting spreadsheet records: ${err?.stack ?? err}`);
      return res.status(400).json({
        detail: `Failed to parse spreadsheet: ${err?.message ?? err}. Please ensure the file is a valid .xlsx, .xls, or .csv.`,
      });
    }
    if (!records.length) {
      return res.status(400).json({
        detail:
          'No recognizable task records or headers found in the file. Please ensure column headers like "Task Name", "Insurance / Payer", or "Status" exist.',
      });
    }

    const defaultCategory = req.body?.category || req.query?.category || null;
    await importRows(db, records, req.user, defaultCategory);
    return res.json({
      success: true,
      message: `Successfully imported/updated ${records.length} tasks from spreadsheet.`,
      count: records.length,
    });
  };

  const requireAdminImport = (req, _res, next) => {
    if (!isAdmin(req.user)) {
      return next(new HttpError(403, { detail: 'Only administrators can import and assign tasks.' }));
    }
    return next();
  };

  route(router, '/import-excel', { post: [requireAdminImport, upload, handler] });
  route(router, '/import-csv', { post: [requireAdminImport, upload, handler] });
  return router;
}
