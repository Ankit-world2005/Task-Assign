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

// A hash made by Django's make_password('pass123'): existing accounts must keep working.
const DJANGO_HASH_PASS123 = 'pbkdf2_sha256$1000000$fqSsDxF3WXmHabAd2GaYcV$LmutQqQj5chTtmU2WNibUKlEI4l4WzAWRkuAvGmCbL8=';
const silent = { info() {}, warn() {}, error() {} };

let dir;
let db;
const servers = [];
let base;
const sentEmails = [];
const ids = {};

async function addUser(username, { admin = false } = {}) {
  const row = await db.get(
    `INSERT INTO auth_user (password, last_login, is_superuser, username, last_name, email, is_staff, is_active, date_joined, first_name)
     VALUES (?, NULL, ?, ?, 'Tester', ?, ?, 1, ?, ?) RETURNING id`,
    DJANGO_HASH_PASS123,
    admin,
    username,
    `${username}@example.com`,
    admin,
    nowDb(),
    username[0].toUpperCase() + username.slice(1),
  );
  await db.run(
    `INSERT INTO tasks_userprofile (role, employee_id, phone, department, avatar_color, current_otp, user_id, otp_created_at)
     VALUES (?, ?, '', 'Operations & Enrollment', '#2563eb', NULL, ?, NULL)`,
    admin ? 'admin' : 'employee',
    `EMP-${row.id}`,
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
  test('verifies hashes created by Django', async () => {
    assert.equal((await checkPassword('pass123', DJANGO_HASH_PASS123)).valid, true);
    assert.equal((await checkPassword('wrong', DJANGO_HASH_PASS123)).valid, false);
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
  });

  test('tasks and updates are recorded under the signed-in user, whatever the client sends', async () => {
    const api = client();
    const me = await signIn(api, 'bob');
    const task = (await api('POST', '/api/tasks/', { project_name: 'P', insurance_name: 'I', created_by: ids.boss })).data;
    assert.equal(task.created_by, me.id);
    const update = await api('POST', `/api/tasks/${task.id}/add-log/`, { remarks: 'note', updated_by: ids.boss });
    assert.equal(update.data.log.updated_by, me.id);
  });

  test('cross-site requests are blocked; allowed origins get CORS headers', async () => {
    const api = client();
    await signIn(api, 'alice');
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
    const api = client();
    const me = await signIn(api, 'alice');

    const invalid = await api('POST', '/api/tasks/', {});
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.data.project_name, ['This field is required.']);
    assert.deepEqual(invalid.data.insurance_name, ['This field is required.']);

    const created = await api('POST', '/api/tasks/', {
      category: 'era_eft',
      project_name: 'Proj',
      insurance_name: 'Payer',
      assignee: me.id,
      creation_date: null,
    });
    assert.equal(created.status, 201);
    assert.match(created.data.task_id, new RegExp(`^TSK-${new Date().getUTCFullYear()}-\\d{3,}$`));
    assert.equal(created.data.task_name, 'Proj');
    assert.equal(created.data.status, 'Request');
    assert.equal(created.data.logs.length, 1);
    assert.equal(created.data.logs[0].remarks, 'Task initially created and assigned to Alice Tester');

    const listed = await api('GET', '/api/tasks/?category=ERA_EFT&search=pro');
    assert.ok(listed.data.some((t) => t.id === created.data.id));
  });

  test('add-log: approval needs portal credentials; schedule sets the follow-up due date', async () => {
    const api = client();
    await signIn(api, 'bob');
    const task = (await api('POST', '/api/tasks/', { category: 'portal_creation', project_name: 'P', insurance_name: 'I' })).data;

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
});
