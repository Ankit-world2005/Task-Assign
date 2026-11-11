// API tests against a throwaway SQLite database. Run with: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/index.js';
import { checkPassword } from '../src/lib/passwords.js';
import { nowDb } from '../src/lib/time.js';

// Standard pbkdf2_sha256 hash for 'pass123': existing accounts keep working.
const HASHED_PASS123 = 'pbkdf2_sha256$1000000$fqSsDxF3WXmHabAd2GaYcV$LmutQqQj5chTtmU2WNibUKlEI4l4WzAWRkuAvGmCbL8=';
const silent = { info() {}, warn() {}, error() {} };

let dir;
let db;
const servers = [];
let base;
const sentEmails = [];
const ids = {};

const ALL_DEPARTMENTS = 'Credentialing, Portal Creation, ERA / EFT, Password Reset, Portal Unblock, Enrollment, Payment Posting';

async function addUser(username, { admin = false, department = ALL_DEPARTMENTS } = {}) {
  const row = await db.get(
    `INSERT INTO auth_user (password, last_login, is_superuser, username, last_name, email, is_staff, is_active, date_joined, first_name)
     VALUES (?, NULL, ?, ?, 'Tester', ?, ?, 1, ?, ?) RETURNING id`,
    HASHED_PASS123,
    admin,
    username,
    `${username}@example.com`,
    admin,
    nowDb(),
    username[0].toUpperCase() + username.slice(1),
  );
  await db.run(
    `INSERT INTO tasks_userprofile (role, employee_id, phone, department, avatar_color, current_otp, user_id, otp_created_at)
     VALUES (?, ?, '', ?, '#2563eb', NULL, ?, NULL)`,
    admin ? 'admin' : 'employee',
    `EMP-${row.id}`,
    department,
    row.id,
  );
  ids[username] = Number(row.id);
}

async function startServer(security = {}) {
  const mailer = { send: async (message) => sentEmails.push(message) };
  const server = createApp({ db, mailer, logger: silent, security }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

/** Minimal browser-like client that keeps the session cookie between calls. */
function client(url = base) {
  let cookie = null;
  return async (method, route, body, headers = {}) => {
    const init = { method, headers: { ...headers } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
    if (cookie) init.headers.Cookie = cookie;
    const res = await fetch(url + route, init);
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('sessionid='));
    if (setCookie) {
      const value = setCookie.split(';')[0];
      cookie = value === 'sessionid=' ? null : value;
    }
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // CSV or empty body
    }
    return { status: res.status, data, headers: res.headers, setCookie };
  };
}

const codeFromEmail = (to) => /\b(\d{6})\b/.exec(sentEmails.filter((m) => m.to === to).at(-1).text)[1];

async function signIn(api, username) {
  const login = await api('POST', '/api/auth/login/', { username, password: 'pass123' });
  assert.equal(login.status, 200);
  const verify = await api('POST', '/api/auth/verify-otp/', { username, otp: codeFromEmail(`${username}@example.com`) });
  assert.equal(verify.status, 200);
  return verify.data.user;
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us24-api-test-'));
  db = await openDatabase({ engine: 'sqlite', path: path.join(dir, 'test.sqlite3') });
  for (const name of ['boss', 'alice', 'bob', 'carol', 'dave']) await addUser(name, { admin: name === 'boss' });
  base = await startServer();
});

after(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  await db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('passwords', () => {
  test('verifies pbkdf2_sha256 password hashes', async () => {
    assert.equal((await checkPassword('pass123', HASHED_PASS123)).valid, true);
    assert.equal((await checkPassword('wrong', HASHED_PASS123)).valid, false);
  });
});

describe('two-step login', () => {
  test('password, emailed OTP, session cookie, logout', async () => {
    const api = client();
    assert.equal((await api('POST', '/api/auth/login/', { username: 'alice' })).status, 400);
    const wrong = await api('POST', '/api/auth/login/', { username: 'alice', password: 'nope' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.detail, 'Invalid username or password.');
    const unknown = await api('POST', '/api/auth/login/', { username: 'nobody', password: 'pass123' });
    assert.deepEqual([unknown.status, unknown.data.detail], [401, 'Invalid username or password.']);

    const login = await api('POST', '/api/auth/login/', { username: 'ALICE@example.com', password: 'pass123' });
    assert.equal(login.status, 200);
    assert.equal(login.data.otp, undefined, 'the code must not be sent back to the browser');
    const code = codeFromEmail('alice@example.com');

    assert.equal((await api('POST', '/api/auth/verify-otp/', { username: 'alice', otp: 'abcdef' })).status, 400);
    const verify = await api('POST', '/api/auth/verify-otp/', { username: 'alice', otp: code });
    assert.equal(verify.status, 200);
    assert.ok(verify.setCookie?.includes('HttpOnly'));
    assert.ok(verify.setCookie?.includes('SameSite=Lax'));
    assert.equal(verify.data.user.profile.role, 'employee');

    assert.equal((await api('GET', '/api/auth/me/')).data.user.username, 'alice');
    assert.equal((await api('POST', '/api/auth/verify-otp/', { username: 'alice', otp: code })).status, 400, 'codes work once');
    await api('POST', '/api/auth/logout/');
    assert.equal((await api('GET', '/api/auth/me/')).data.authenticated, false);
  });

  test('the master OTP 123456 no longer works', async () => {
    const api = client();
    await api('POST', '/api/auth/login/', { username: 'bob', password: 'pass123' });
    if (codeFromEmail('bob@example.com') === '123456') return; // one-in-a-million real code
    assert.equal((await api('POST', '/api/auth/verify-otp/', { username: 'bob', otp: '123456' })).status, 400);
  });

  test('five wrong codes cancel the code', async () => {
    const api = client();
    await api('POST', '/api/auth/login/', { username: 'carol', password: 'pass123' });
    const code = codeFromEmail('carol@example.com');
    const wrongCode = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) assert.equal((await api('POST', '/api/auth/verify-otp/', { username: 'carol', otp: wrongCode })).status, 400);
    const fifth = await api('POST', '/api/auth/verify-otp/', { username: 'carol', otp: wrongCode });
    assert.match(fifth.data.detail, /Too many incorrect codes/);
    assert.equal((await api('POST', '/api/auth/verify-otp/', { username: 'carol', otp: code })).status, 400);
  });

  test('ten wrong passwords lock that sign-in for 15 minutes', async () => {
    const api = client();
    for (let i = 0; i < 10; i++) assert.equal((await api('POST', '/api/auth/login/', { username: 'dave', password: `bad-${i}` })).status, 401);
    const blocked = await api('POST', '/api/auth/login/', { username: 'dave', password: 'pass123' });
    assert.equal(blocked.status, 429);
    assert.match(blocked.data.detail, /Too many failed sign-in attempts/);
  });

  test('SHOW_OTP_ON_SCREEN returns the code for the login page', async () => {
    const api = client(await startServer({ showOtpOnScreen: true }));
    const login = await api('POST', '/api/auth/login/', { username: 'bob', password: 'pass123' });
    assert.equal(login.data.otp, codeFromEmail('bob@example.com'));
  });
});

describe('access control', () => {
  test('API data needs a session; X-Current-User and Basic credentials are not accepted', async () => {
    const anon = client();
    for (const route of ['/api/tasks/', '/api/auth/users/', '/api/stats/', '/api/profile/dashboard/', '/api/export-csv/']) {
      assert.equal((await anon('GET', route)).status, 401, route);
    }
    assert.equal((await anon('GET', '/api/tasks/', undefined, { 'X-Current-User': 'boss' })).status, 401);
    const basic = `Basic ${Buffer.from('boss:pass123').toString('base64')}`;
    assert.equal((await anon('GET', '/api/tasks/', undefined, { Authorization: basic })).status, 401);
    assert.equal((await anon('GET', '/api/auth/me/', undefined, { 'X-Current-User': 'boss' })).data.authenticated, false);
    const create = await anon('POST', '/api/auth/users/create/', { username: 'x', email: 'x@x.com', password: 'abcd' }, { 'X-Current-User': 'boss' });
    assert.equal(create.status, 401);
  });

  test('only admin sessions can manage users', async () => {
    const employee = client();
    await signIn(employee, 'alice');
    const payload = { username: 'newbie', email: 'newbie@example.com', password: 'abcd1234', is_active: 'false' };
    assert.equal((await employee('POST', '/api/auth/users/create/', payload)).status, 403);
    assert.equal((await employee('POST', `/api/auth/users/${ids.bob}/toggle-access/`)).status, 403);

    const admin = client();
    await signIn(admin, 'boss');
    const created = await admin('POST', '/api/auth/users/create/', payload);
    assert.equal(created.status, 201);
    assert.equal(created.data.user.is_active, false, '"false" means inactive');
    assert.equal(created.data.user.profile.employee_id, `US24-EMP${String(created.data.user.id).padStart(2, '0')}`);
    assert.equal((await admin('POST', '/api/auth/users/create/', payload)).status, 400);

    const allDepartments = 'Credentialing, Portal Creation, ERA / EFT, Password Reset, Portal Unblock, Enrollment, Payment Posting';
    const updated = await admin('POST', `/api/auth/users/${created.data.user.id}/update/`, { department: allDepartments });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.user.profile.department, allDepartments);
  });

  test('only admin sessions can create, import, or reassign tasks', async () => {
    const employee = client();
    const alice = await signIn(employee, 'alice');
    assert.equal((await employee('POST', '/api/tasks/', { project_name: 'P', insurance_name: 'I', assignee: alice.id })).status, 403);

    const form = new FormData();
    form.append('file', new Blob(['Task Name,Category,Insurance / Payer\nX,ERA/EFT,Aetna\n'], { type: 'text/csv' }), 't.csv');
    assert.equal((await employee('POST', '/api/import-excel/', form)).status, 403);

    const admin = client();
    await signIn(admin, 'boss');
    const created = await admin('POST', '/api/tasks/', { project_name: 'LockTest', insurance_name: 'Aetna', assignee: alice.id });
    assert.equal(created.status, 201);
    const taskId = created.data.id;

    assert.equal((await employee('PATCH', `/api/tasks/${taskId}/`, { assignee: ids.bob })).status, 403);
    assert.equal((await employee('PUT', `/api/tasks/${taskId}/`, { project_name: 'LockTest', insurance_name: 'Aetna', assignee: ids.bob })).status, 403);
    assert.equal((await employee('POST', `/api/tasks/${taskId}/add-log/`, { reassigned_to: ids.bob, remarks: 'reassign' })).status, 403);
    assert.equal((await employee('GET', `/api/tasks/${taskId}/`)).data.assignee, alice.id);

    const empUpdate = await employee('POST', `/api/tasks/${taskId}/add-log/`, { status: 'In Process', remarks: 'employee update' });
    assert.equal(empUpdate.status, 200);

    const adminReassign = await admin('POST', `/api/tasks/${taskId}/add-log/`, { reassigned_to: ids.bob, remarks: 'admin reassign' });
    assert.equal(adminReassign.status, 200);
    assert.equal(adminReassign.data.task.assignee, ids.bob);
  });

  test('tasks and updates are recorded under the signed-in user, whatever the client sends', async () => {
    const adminApi = client();
    const boss = await signIn(adminApi, 'boss');
    const task = (await adminApi('POST', '/api/tasks/', { project_name: 'P', insurance_name: 'I', assignee: ids.bob, created_by: ids.alice })).data;
    assert.equal(task.created_by, boss.id);

    const bobApi = client();
    const bob = await signIn(bobApi, 'bob');
    const update = await bobApi('POST', `/api/tasks/${task.id}/add-log/`, { remarks: 'note', updated_by: ids.boss });
    assert.equal(update.data.log.updated_by, bob.id);
  });

  test('cross-site requests are blocked; allowed origins get CORS headers', async () => {
    const api = client();
    await signIn(api, 'boss');
    const evil = await api('POST', '/api/tasks/', { project_name: 'P', insurance_name: 'I' }, { 'Sec-Fetch-Site': 'cross-site', Origin: 'http://evil.example' });
    assert.deepEqual([evil.status, evil.data.detail], [403, 'Cross-site request blocked.']);
    const sameOrigin = await api('POST', '/api/tasks/', { project_name: 'P', insurance_name: 'I' }, { 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(sameOrigin.status, 201);

    const preflight = (origin) =>
      fetch(`${base}/api/tasks/`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
    assert.equal((await preflight('http://evil.example')).headers.get('access-control-allow-origin'), null);
    assert.equal((await preflight('http://localhost:5173')).headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });
});

describe('tasks', () => {
  test('create assigns a TSK id and writes the creation log; validation errors keep their shape', async () => {
    const adminApi = client();
    await signIn(adminApi, 'boss');

    const invalid = await adminApi('POST', '/api/tasks/', {});
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.data.project_name, ['This field is required.']);
    assert.deepEqual(invalid.data.insurance_name, ['This field is required.']);

    const created = await adminApi('POST', '/api/tasks/', {
      category: 'era_eft',
      project_name: 'Proj',
      insurance_name: 'Payer',
      address: '123 Main St, Suite 200',
      assignee: ids.alice,
      creation_date: null,
    });
    assert.equal(created.status, 201);
    assert.match(created.data.task_id, new RegExp(`^TSK-${new Date().getUTCFullYear()}-\\d{3,}$`));
    assert.equal(created.data.task_name, 'Proj');
    assert.equal(created.data.address, '123 Main St, Suite 200');
    assert.equal(created.data.status, 'Request');
    assert.equal(created.data.logs.length, 1);
    assert.equal(created.data.logs[0].remarks, 'Task initially created and assigned to Alice Tester');

    const empApi = client();
    await signIn(empApi, 'alice');
    const listed = await empApi('GET', '/api/tasks/?category=ERA_EFT&search=pro');
    assert.ok(listed.data.some((t) => t.id === created.data.id));
  });

  test('add-log: approval needs portal credentials; schedule sets the follow-up due date', async () => {
    const adminApi = client();
    await signIn(adminApi, 'boss');
    const task = (await adminApi('POST', '/api/tasks/', { category: 'portal_creation', project_name: 'P', insurance_name: 'I', assignee: ids.bob })).data;

    const api = client();
    await signIn(api, 'bob');

    const missing = await api('POST', `/api/tasks/${task.id}/add-log/`, { status: 'Approved', remarks: 'x' });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.detail, 'Portal Link, User ID, Password are required to approve this task.');

    const scheduled = await api('POST', `/api/tasks/${task.id}/add-log/`, {
      status: 'In Process',
      moc: 'Email',
      remarks: 'called payer',
      work_date: '2026-01-30',
      follow_up_days: 3,
    });
    assert.equal(scheduled.status, 200);
    assert.equal(scheduled.data.task.follow_up_due_date, '2026-02-02');
    assert.equal(scheduled.data.log.moc, 'email');

    const approved = await api('POST', `/api/tasks/${task.id}/add-log/`, {
      status: 'Approved',
      remarks: 'done',
      portal_link: 'https://portal.example.com',
      portal_user_id: 'user1',
      portal_password: 'secret',
      work_date: '2026-02-01',
      follow_up_days: 2,
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.task.status, 'Approved');
    assert.equal(approved.data.task.portal_user_id, 'user1');
    assert.equal(approved.data.task.follow_up_due_date, null);
    assert.equal(approved.data.task.logs.length, 3);
  });
});

describe('import and export', () => {
  test('CSV import maps headers and values; the export lists rows and defuses formulas', async () => {
    const api = client();
    await signIn(api, 'boss');
    const csv =
      'Task Name,Category,Insurance / Payer,Status,Assigned To\n' +
      'Imported One,ERA / EFT,Cigna,in progress,alice\n' +
      '"=HYPERLINK(""http://evil.example"")",ERA/EFT,Aetna,Pending,\n';
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'tasks.csv');
    const imported = await api('POST', '/api/import-excel/', form);
    assert.equal(imported.status, 200);
    assert.equal(imported.data.message, 'Successfully imported/updated 2 tasks from spreadsheet.');

    const task = (await api('GET', '/api/tasks/?search=Imported One')).data[0];
    assert.equal(task.category, 'era_eft');
    assert.equal(task.status, 'In Progress');
    assert.equal(task.assignee_name, 'Alice Tester');
    assert.equal(task.created_by_name, 'Boss Tester');

    const exported = await api('GET', '/api/export-csv/?category=era_eft');
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-disposition'), /attachment; filename="us24_tasks_\d{8}_\d{4}\.csv"/);
    assert.ok(exported.data.startsWith('Task ID,Category,Project Name,Task Name,'));
    assert.ok(exported.data.includes(`${task.task_id},ERA/EFT,US24 Solution Project,Imported One,`));
    assert.ok(exported.data.includes(`"'=HYPERLINK(""http://evil.example"")"`));
  });

  test('payment posting CSV import preserves all 13 columns including Task type and Remarks', async () => {
    const api = client();
    await signIn(api, 'boss');
    const csv =
      'Date,Project Name,Task type,File Name,Number of File for PPT,DENIALS SS,Remaining,Approx Time Min,Final Time by User,Remarks,Assinged User,Sup QA,Time By Manish\n' +
      '2026-11-11,ARRA,Denials,Batch_09.pdf,5,Done,1,45,40 min,Check denial note,alice,Approved,10 min\n';
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'pp.csv');
    form.append('category', 'payment_posting');
    const res = await api('POST', '/api/import-excel/', form);
    assert.equal(res.status, 200);

    const rows = (await api('GET', '/api/tasks/?category=payment_posting&search=ARRA')).data;
    assert.equal(rows.length, 1);
    const t = rows[0];
    assert.equal(t.creation_date, '2026-11-11');
    assert.equal(t.project_name, 'ARRA');
    assert.equal(t.task_name, 'Denials');
    assert.equal(t.assignee, ids.alice);
    const meta = JSON.parse(t.notes);
    assert.equal(meta.file_name, 'Batch_09.pdf');
    assert.equal(meta.num_files_ppt, '5');
    assert.equal(meta.denials_ss, 'Done');
    assert.equal(meta.remaining, '1');
    assert.equal(meta.approx_time_min, '45');
    assert.equal(meta.final_time_user, '40 min');
    assert.equal(meta.remarks, 'Check denial note');
    assert.equal(meta.sup_qa, 'Approved');
    assert.equal(meta.time_by_manish, '10 min');

    // Explicit assignee_id override on import assigns directly to that Payment Posting user
    await addUser('pp_import_target', { department: 'Payment Posting' });
    await addUser('pp_import_denied', { department: 'Credentialing' });
    const overrideForm = new FormData();
    overrideForm.append('file', new Blob(['Date,Project Name,Task type,File Name\n2026-11-11,WESTAZ,ERA,Batch_10.pdf\n'], { type: 'text/csv' }), 'pp2.csv');
    overrideForm.append('category', 'payment_posting');
    overrideForm.append('assignee_id', String(ids.pp_import_target));
    const overrideRes = await api('POST', '/api/import-excel/', overrideForm);
    assert.equal(overrideRes.status, 200);
    const westazRows = (await api('GET', '/api/tasks/?category=payment_posting&search=WESTAZ')).data;
    assert.equal(westazRows.length, 1);
    assert.equal(westazRows[0].assignee, ids.pp_import_target);

    const deniedForm = new FormData();
    deniedForm.append('file', new Blob(['Date,Project Name,Task type,File Name\n2026-11-11,X,ERA,B.pdf\n'], { type: 'text/csv' }), 'pp3.csv');
    deniedForm.append('category', 'payment_posting');
    deniedForm.append('assignee_id', String(ids.pp_import_denied));
    assert.equal((await api('POST', '/api/import-excel/', deniedForm)).status, 400);
  });
});

describe('department task isolation', () => {
  test('non-admin users can only access tasks matching their checked department checkboxes', async () => {
    await addUser('dept_multi', { department: 'Credentialing, ERA / EFT, Portal Unblock' });
    await addUser('dept_enroll', { department: 'Enrollment' });
    await addUser('dept_none', { department: 'Management' });

    const admin = client();
    await signIn(admin, 'boss');

    const credTask = (await admin('POST', '/api/tasks/', { category: 'credentialing', project_name: 'P1', insurance_name: 'Aetna', assignee: ids.dept_multi })).data;
    const eraTask = (await admin('POST', '/api/tasks/', { category: 'era_eft', project_name: 'P2', insurance_name: 'BCBS', assignee: ids.dept_multi })).data;
    const unblockTask = (await admin('POST', '/api/tasks/', { category: 'portal_unblock', project_name: 'P3', insurance_name: 'Cigna', assignee: ids.dept_multi })).data;
    const blockedPortal = (await admin('POST', '/api/tasks/', { category: 'portal_creation', project_name: 'P4', insurance_name: 'Humana', assignee: ids.dept_multi })).data;
    const blockedPosting = (await admin('POST', '/api/tasks/', { category: 'payment_posting', project_name: 'P5', insurance_name: 'Posting', assignee: ids.dept_multi })).data;

    const multi = client();
    await signIn(multi, 'dept_multi');

    const listRes = await multi('GET', '/api/tasks/');
    assert.equal(listRes.status, 200);
    assert.deepEqual(
      listRes.data.map((t) => t.id).sort((a, b) => a - b),
      [credTask.id, eraTask.id, unblockTask.id].sort((a, b) => a - b),
    );
    assert.deepEqual((await multi('GET', '/api/tasks/?category=portal_creation')).data, []);

    assert.equal((await multi('GET', `/api/tasks/${credTask.id}/`)).status, 200);
    assert.equal((await multi('GET', `/api/tasks/${blockedPortal.id}/`)).status, 403);
    assert.equal((await multi('POST', `/api/tasks/${blockedPosting.id}/add-log/`, { remarks: 'blocked' })).status, 403);

    const stats = await multi('GET', '/api/stats/');
    assert.equal(stats.status, 200);
    assert.equal(stats.data.kpis.total, 3);
    assert.equal(stats.data.categories.portal_creation, 0);
    assert.equal(stats.data.categories.payment_posting, 0);
    assert.ok(stats.data.recent_logs.every((l) => [credTask.id, eraTask.id, unblockTask.id].includes(l.task)));

    const profileDash = await multi('GET', '/api/profile/dashboard/');
    assert.equal(profileDash.status, 200);
    assert.equal(profileDash.data.counts.total, 3);

    const csvRes = await multi('GET', '/api/export-csv/');
    assert.ok(csvRes.data.includes(credTask.task_id));
    assert.ok(!csvRes.data.includes(blockedPortal.task_id));
    assert.ok(!csvRes.data.includes(blockedPosting.task_id));

    // 'Enrollment' grants credentialing, portal_creation, era_eft, but not payment_posting
    const enrollOk = (await admin('POST', '/api/tasks/', { category: 'portal_creation', project_name: 'E1', insurance_name: 'Aetna', assignee: ids.dept_enroll })).data;
    const enrollBlocked = (await admin('POST', '/api/tasks/', { category: 'payment_posting', project_name: 'E2', insurance_name: 'Posting', assignee: ids.dept_enroll })).data;
    const enrollClient = client();
    await signIn(enrollClient, 'dept_enroll');
    assert.deepEqual((await enrollClient('GET', '/api/tasks/')).data.map((t) => t.id), [enrollOk.id]);
    assert.equal((await enrollClient('GET', `/api/tasks/${enrollBlocked.id}/`)).status, 403);

    // Non-checkbox / cleared department grants zero task access
    const noneTask = (await admin('POST', '/api/tasks/', { category: 'credentialing', project_name: 'N1', insurance_name: 'Aetna', assignee: ids.dept_none })).data;
    const noneClient = client();
    await signIn(noneClient, 'dept_none');
    assert.deepEqual((await noneClient('GET', '/api/tasks/')).data, []);
    assert.equal((await noneClient('GET', `/api/tasks/${noneTask.id}/`)).status, 403);
    assert.equal((await noneClient('GET', '/api/stats/')).data.kpis.total, 0);
  });

  test('payment posting check-sheet lets all Payment Posting users add, view, and update 17-column entries, blocking non-posting users', async () => {
    await addUser('pp_user1', { department: 'Payment Posting' });
    await addUser('pp_user2', { department: 'Payment Posting' });
    await addUser('cred_only', { department: 'Credentialing' });

    const u1 = client();
    await signIn(u1, 'pp_user1');
    const created1 = await u1('POST', '/api/payment-posting/check-sheet/', {
      clinic: 'ARRA',
      payer: 'Aetna',
      eob_source: 'Availity',
      method: 'EFT',
      era_eob: 'ERA',
      check_no: 'CHK-9001',
      check_date: '2026-11-10',
      check_amount: '1500.00',
      posted_amount: '1200.00',
      remaining_amount: '300.00',
      recoupment: '0.00',
      status: 'Partially Posted',
      posted_date: '2026-11-11',
      posted_by: 'Pp_user1 Tester',
      remarks: 'Initial post',
      clearance_date: '',
      error_note: '',
      created_by: ids.cred_only, // must be ignored in favor of req.user
    });
    assert.equal(created1.status, 201);
    assert.equal(created1.data.created_by, ids.pp_user1);
    assert.equal(created1.data.clinic, 'ARRA');
    assert.equal(created1.data.check_no, 'CHK-9001');

    const u2 = client();
    await signIn(u2, 'pp_user2');
    const listU2 = await u2('GET', '/api/payment-posting/check-sheet/');
    assert.equal(listU2.status, 200);
    assert.equal(listU2.data.length, 1);
    assert.equal(listU2.data[0].payer, 'Aetna');

    const updated = await u2('PATCH', `/api/payment-posting/check-sheet/${created1.data.id}/`, {
      posted_amount: '1500.00',
      remaining_amount: '0.00',
      status: 'Posted',
      clearance_date: '2026-11-12',
      error_note: 'None',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.status, 'Posted');
    assert.equal(updated.data.clearance_date, '2026-11-12');
    assert.equal(updated.data.remaining_amount, '0.00');

    // Non-creator non-admin cannot delete someone else's check-sheet entry
    assert.equal((await u2('DELETE', `/api/payment-posting/check-sheet/${created1.data.id}/`)).status, 403);

    // Non-Payment-Posting user cannot access, add, or update Check-Sheet
    const nonPp = client();
    await signIn(nonPp, 'cred_only');
    assert.equal((await nonPp('GET', '/api/payment-posting/check-sheet/')).status, 403);
    assert.equal((await nonPp('POST', '/api/payment-posting/check-sheet/', { clinic: 'X' })).status, 403);
    assert.equal((await nonPp('PATCH', `/api/payment-posting/check-sheet/${created1.data.id}/`, { status: 'Posted' })).status, 403);
  });
});
