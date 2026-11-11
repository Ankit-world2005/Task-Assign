// /api/tasks/* - list / create / retrieve / update / delete, next-id and add-log.
import express from 'express';
import { HttpError, requestData, route } from '../http.js';
import { isTruthy, pyInt, pyStr, sliceChars } from '../lib/py.js';
import { addDays, nowDb, parseIsoDate } from '../lib/time.js';
import {
  MOC_CHOICES,
  PORTAL_CREDENTIAL_CATEGORIES,
  deleteTask,
  findTask,
  generateTaskId,
  getLogRow,
  getTaskRow,
  insertLog,
  insertTask,
  listTasks,
  resolveTaskId,
  updateTask,
} from '../models/tasks.js';
import { canAccessTaskCategory, displayName, fullName, getUserById, isAdmin } from '../models/users.js';
import { serializeCheckSheetEntry, serializeLog, serializeTask, serializeTasks, userNames } from '../serializers.js';
import { validateTaskInput } from '../validation/taskInput.js';

export function taskRoutes({ db, logger }) {
  const router = express.Router();

  const taskOr404 = async (req) => {
    const task = await findTask(db, req.params.pk, req.query, req.user);
    if (task) return task;
    const pk = pyInt(req.params.pk);
    if (pk !== null && req.user && !isAdmin(req.user)) {
      const rawTask = await getTaskRow(db, pk);
      const isOwnTask =
        rawTask && (rawTask.assignee_id === req.user.id || (rawTask.assignee_id === null && rawTask.created_by_id === req.user.id));
      if (isOwnTask && !canAccessTaskCategory(req.user, rawTask.category)) {
        throw new HttpError(403, { detail: 'You only have access to tasks from your assigned departments.' });
      }
    }
    // A non-numeric id gets a bare "Not found.", as before.
    throw new HttpError(404, {
      detail: pk === null ? 'Not found.' : 'No Task matches the given query.',
    });
  };

  route(router, '/tasks', {
    get: async (req, res) => res.json(await serializeTasks(db, await listTasks(db, req.query, req.user))),
    post: async (req, res) => {
      if (!isAdmin(req.user)) throw new HttpError(403, { detail: 'Only administrators can assign tasks.' });
      const data = requestData(req);
      const result = await validateTaskInput(db, data);
      if (result.errors) {
        logger.error(`[Task Create 400] Validation failed: ${JSON.stringify(result.errors)}`);
        return res.status(400).json(result.errors);
      }
      const creator = req.user;
      const taskPk = await db.transaction(async (tx) => {
        // The requested task_id is kept when it's free, otherwise a new one is generated.
        const requestedId = isTruthy(data.task_id) ? pyStr(data.task_id) : '';
        const id = await insertTask(tx, {
          ...result.values,
          task_id: await resolveTaskId(tx, requestedId),
          created_by_id: creator.id,
        });
        const task = await getTaskRow(tx, id);
        const assignee = task.assignee_id === null ? null : await getUserById(tx, task.assignee_id);
        await insertLog(tx, {
          task_id: id,
          updated_by_id: creator.id,
          previous_status: '',
          new_status: task.status,
          remarks: `Task initially created and assigned to ${assignee ? fullName(assignee) : 'Unassigned'}`,
        });
        return id;
      });
      return res.status(201).json(await serializeTask(db, await getTaskRow(db, taskPk)));
    },
  });

  route(router, '/tasks/next-id', {
    get: async (req, res) => {
      const { taskId, nextNum } = await generateTaskId(db);
      res.json({ task_id: taskId, next_num: nextNum });
    },
  });

  const update = (partial) => async (req, res) => {
    if (!isAdmin(req.user)) throw new HttpError(403, { detail: 'Only administrators can assign or modify tasks.' });
    const task = await taskOr404(req);
    const result = await validateTaskInput(db, requestData(req), { instance: task, partial });
    if (result.errors) return res.status(400).json(result.errors);
    await db.transaction((tx) => updateTask(tx, task, result.values));
    return res.json(await serializeTask(db, await getTaskRow(db, task.id)));
  };

  route(router, '/tasks/:pk', {
    get: async (req, res) => res.json(await serializeTask(db, await taskOr404(req))),
    put: update(false),
    patch: update(true),
    delete: async (req, res) => {
      if (!isAdmin(req.user)) throw new HttpError(403, { detail: 'Only administrators can delete tasks.' });
      await deleteTask(db, (await taskOr404(req)).id);
      res.status(204).end();
    },
  });

  // Records an update on a task: status change, follow-up schedule, portal credentials, reassignment.
  route(router, '/tasks/:pk/add-log', {
    post: async (req, res) => {
      const task = await taskOr404(req);
      const data = requestData(req);
      const newStatus = isTruthy(data.status) ? pyStr(data.status) : task.status;
      const remarks = isTruthy(data.remarks) ? pyStr(data.remarks).trim() : '';
      const rawAttachment = data.attachment;
      const attachment =
        rawAttachment === undefined || rawAttachment === null || rawAttachment === 'null' ? '' : pyStr(rawAttachment);

      if (!remarks && !attachment) return res.status(400).json({ detail: 'Remarks (text or image) are required.' });

      const moc = isTruthy(data.moc) ? pyStr(data.moc).trim().toLowerCase() : '';
      if (moc !== '' && !MOC_CHOICES.includes(moc)) return res.status(400).json({ detail: 'MOC must be Call, Email or Fax.' });

      const tat = sliceChars((isTruthy(data.tat) ? pyStr(data.tat) : '').trim(), 20);

      let workDate = null;
      if (isTruthy(data.work_date)) {
        workDate = parseIsoDate(pyStr(data.work_date));
        if (!workDate) return res.status(400).json({ detail: 'Work date must be a valid date.' });
      }

      let followUpDays = null;
      const rawDays = data.follow_up_days;
      if (rawDays !== undefined && rawDays !== null && rawDays !== '' && rawDays !== 'null') {
        followUpDays = pyInt(rawDays) ?? -1;
        if (followUpDays < 0 || followUpDays > 365) {
          return res.status(400).json({ detail: 'MOC F/W must be a number of days between 0 and 365.' });
        }
      }

      // Approving portal creation needs link + user ID + password; password reset needs user ID + password.
      let portalLink = '';
      let portalUserId = '';
      let portalPassword = '';
      if (newStatus === 'Approved') {
        const missing = [];
        if (task.category === 'portal_creation') {
          portalLink = sliceChars((isTruthy(data.portal_link) ? pyStr(data.portal_link) : '').trim(), 500);
          if (!portalLink) missing.push('Portal Link');
        }
        if (PORTAL_CREDENTIAL_CATEGORIES.includes(task.category)) {
          portalUserId = sliceChars((isTruthy(data.portal_user_id) ? pyStr(data.portal_user_id) : '').trim(), 255);
          portalPassword = sliceChars(isTruthy(data.portal_password) ? pyStr(data.portal_password) : '', 255);
          if (!portalUserId) missing.push('User ID');
          if (!portalPassword) missing.push('Password');
        }
        if (missing.length) {
          return res.status(400).json({
            detail: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required to approve this task.`,
          });
        }
      }

      const changes = { status: newStatus };
      // Updates carrying schedule fields reset the follow-up due date; quick status changes keep it.
      if ('work_date' in data || 'follow_up_days' in data) {
        if (workDate) changes.work_date = workDate;
        changes.follow_up_days = followUpDays;
        changes.follow_up_due_date =
          workDate && followUpDays !== null && newStatus !== 'Approved' ? addDays(workDate, followUpDays) : null;
      }
      if (portalLink) changes.portal_link = portalLink;
      if (portalUserId) changes.portal_user_id = portalUserId;
      if (portalPassword) changes.portal_password = portalPassword;

      let reassignedUser = null;
      if (isTruthy(data.reassigned_to)) {
        if (!isAdmin(req.user)) {
          throw new HttpError(403, { detail: 'Only administrators can assign or reassign tasks.' });
        }
        const id = pyInt(data.reassigned_to);
        reassignedUser = id === null ? null : await getUserById(db, id);
        if (reassignedUser) changes.assignee_id = reassignedUser.id;
      }

      // The update is always recorded under the signed-in user (a client-sent updated_by is ignored).
      const logId = await db.transaction(async (tx) => {
        await updateTask(tx, task, changes);
        return insertLog(tx, {
          task_id: task.id,
          updated_by_id: req.user.id,
          previous_status: task.status,
          new_status: newStatus,
          remarks,
          attachment,
          reassigned_to_id: reassignedUser?.id ?? null,
          moc,
          tat,
          work_date: workDate,
          follow_up_days: followUpDays,
          portal_link: portalLink,
          portal_user_id: portalUserId,
          portal_password: portalPassword,
        });
      });

      return res.json({
        success: true,
        message: 'Log saved and task updated.',
        task: await serializeTask(db, await getTaskRow(db, task.id)),
        log: serializeLog(await getLogRow(db, logId), await userNames(db)),
      });
    },
  });

  // Payment Posting Check-Sheet: 17-column completed-task ledger shared across Payment Posting users.
  const requirePaymentPostingAccess = (user) => {
    if (!canAccessTaskCategory(user, 'payment_posting')) {
      throw new HttpError(403, { detail: 'You do not have access to Payment Posting Check-Sheet.' });
    }
  };

  const CHECK_SHEET_TEXT_SPECS = [
    ['clinic', 255],
    ['payer', 255],
    ['eob_source', 255],
    ['method', 100],
    ['era_eob', 100],
    ['check_no', 100],
    ['check_amount', 50],
    ['posted_amount', 50],
    ['remaining_amount', 50],
    ['recoupment', 100],
    ['status', 100],
    ['posted_by', 150],
    ['remarks', 2000],
    ['error_note', 255],
  ];

  const CHECK_SHEET_DATE_FIELDS = ['check_date', 'posted_date', 'clearance_date'];

  const parseCheckSheetInput = (data, existing = null, user = null) => {
    const out = {};
    for (const [key, maxLen] of CHECK_SHEET_TEXT_SPECS) {
      if (key in data) {
        const raw = data[key] === null || data[key] === undefined ? '' : pyStr(data[key]).trim();
        out[key] = sliceChars(raw, maxLen);
      } else if (!existing) {
        out[key] = key === 'posted_by' ? (displayName(user) || '') : '';
      } else {
        out[key] = existing[key] ?? '';
      }
    }
    if (!out.clinic) return { error: 'Clinic is required.' };

    for (const key of CHECK_SHEET_DATE_FIELDS) {
      if (key in data) {
        if (!isTruthy(data[key])) {
          out[key] = null;
        } else {
          const parsed = parseIsoDate(pyStr(data[key]));
          if (!parsed) return { error: `${key.replace('_', ' ')} must be a valid YYYY-MM-DD date.` };
          out[key] = parsed;
        }
      } else if (!existing) {
        out[key] = null;
      } else {
        out[key] = existing[key] ?? null;
      }
    }
    return { values: out };
  };

  route(router, '/payment-posting/check-sheet', {
    get: async (req, res) => {
      requirePaymentPostingAccess(req.user);
      const rows = await db.all('SELECT * FROM tasks_paymentchecksheet ORDER BY id DESC');
      const names = await userNames(db);
      return res.json(rows.map((row) => serializeCheckSheetEntry(row, names)));
    },
    post: async (req, res) => {
      requirePaymentPostingAccess(req.user);
      const parsed = parseCheckSheetInput(requestData(req), null, req.user);
      if (parsed.error) return res.status(400).json({ detail: parsed.error });
      const v = parsed.values;
      const now = nowDb();
      const inserted = await db.get(
        `INSERT INTO tasks_paymentchecksheet
           (clinic, payer, eob_source, method, era_eob, check_no, check_date, check_amount, posted_amount,
            remaining_amount, recoupment, status, posted_date, posted_by, remarks, clearance_date, error_note,
            created_at, updated_at, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        v.clinic, v.payer, v.eob_source, v.method, v.era_eob, v.check_no, v.check_date,
        v.check_amount, v.posted_amount, v.remaining_amount, v.recoupment, v.status,
        v.posted_date, v.posted_by, v.remarks, v.clearance_date, v.error_note,
        now, now, req.user.id,
      );
      const row = await db.get('SELECT * FROM tasks_paymentchecksheet WHERE id = ?', Number(inserted.id));
      return res.status(201).json(serializeCheckSheetEntry(row, await userNames(db)));
    },
  });

  route(router, '/payment-posting/check-sheet/:pk', {
    patch: async (req, res) => {
      requirePaymentPostingAccess(req.user);
      const id = pyInt(req.params.pk);
      const existing = id === null ? null : await db.get('SELECT * FROM tasks_paymentchecksheet WHERE id = ?', id);
      if (!existing) throw new HttpError(404, { detail: 'Check-Sheet entry not found.' });
      const parsed = parseCheckSheetInput(requestData(req), existing, req.user);
      if (parsed.error) return res.status(400).json({ detail: parsed.error });
      const v = parsed.values;
      await db.run(
        `UPDATE tasks_paymentchecksheet
            SET clinic = ?, payer = ?, eob_source = ?, method = ?, era_eob = ?, check_no = ?, check_date = ?,
                check_amount = ?, posted_amount = ?, remaining_amount = ?, recoupment = ?, status = ?,
                posted_date = ?, posted_by = ?, remarks = ?, clearance_date = ?, error_note = ?, updated_at = ?
          WHERE id = ?`,
        v.clinic, v.payer, v.eob_source, v.method, v.era_eob, v.check_no, v.check_date,
        v.check_amount, v.posted_amount, v.remaining_amount, v.recoupment, v.status,
        v.posted_date, v.posted_by, v.remarks, v.clearance_date, v.error_note, nowDb(), existing.id,
      );
      const updated = await db.get('SELECT * FROM tasks_paymentchecksheet WHERE id = ?', existing.id);
      return res.json(serializeCheckSheetEntry(updated, await userNames(db)));
    },
    delete: async (req, res) => {
      requirePaymentPostingAccess(req.user);
      const id = pyInt(req.params.pk);
      const row = id === null ? null : await db.get('SELECT * FROM tasks_paymentchecksheet WHERE id = ?', id);
      if (!row) throw new HttpError(404, { detail: 'Check-Sheet entry not found.' });
      if (!isAdmin(req.user) && row.created_by_id !== req.user.id) {
        throw new HttpError(403, { detail: 'Only administrators or the entry creator can remove check-sheet rows.' });
      }
      await db.run('DELETE FROM tasks_paymentchecksheet WHERE id = ?', row.id);
      return res.status(204).end();
    },
  });

  return router;
}
