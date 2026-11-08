// Request identity: the `sessionid` cookie set after the two-step login is the only proof of who
// is calling. Headers such as X-Current-User are ignored.
import crypto from 'node:crypto';
import { formatDbDatetime, nowDb, nowMicros } from './lib/time.js';
import { getUserById, isAdmin } from './models/users.js';

export const SESSION_COOKIE = 'sessionid';
const SESSION_AGE_SECONDS = 1_209_600; // two weeks
const SESSION_GONE = Symbol('session gone');

// Endpoints that work without a session (everything else returns 401).
const PUBLIC_PATHS = new Set(['/auth/login', '/auth/verify-otp', '/auth/me', '/auth/logout']);

// A session stops working when the user's password changes.
const passwordFingerprint = (passwordHash) => crypto.createHash('sha256').update(passwordHash ?? '').digest('hex');

const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'lax', path: '/', secure: Boolean(req.app.locals.secureCookies) });

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim().replace(/^"|"$/g, '');
  }
  return null;
}

/** The session's user; null if that user is inactive; SESSION_GONE if the session is no longer valid. */
async function sessionUser(db, sessionKey) {
  const session = await db.get('SELECT * FROM node_session WHERE session_key = ? AND expire_date > ?', sessionKey, nowDb());
  const user = session && (await getUserById(db, session.user_id));
  if (!user || session.auth_hash !== passwordFingerprint(user.password)) {
    await db.run('DELETE FROM node_session WHERE session_key = ?', sessionKey);
    return SESSION_GONE;
  }
  return user.is_active ? user : null;
}

/** Removes a session Set-Cookie already queued on this response. */
function dropQueuedSessionCookie(res) {
  const queued = res.getHeader('Set-Cookie');
  if (!queued) return;
  const kept = [].concat(queued).filter((cookie) => !String(cookie).startsWith(`${SESSION_COOKIE}=`));
  if (kept.length) res.setHeader('Set-Cookie', kept);
  else res.removeHeader('Set-Cookie');
}

/** Login: new session for the user (any earlier one is dropped), cookie set, last_login updated. */
export async function startSession(db, req, res, user) {
  if (req.sessionKey) await db.run('DELETE FROM node_session WHERE session_key = ?', req.sessionKey);
  await db.run('DELETE FROM node_session WHERE expire_date <= ?', nowDb());
  const key = crypto.randomBytes(20).toString('hex');
  await db.run(
    'INSERT INTO node_session (session_key, user_id, auth_hash, expire_date) VALUES (?, ?, ?, ?)',
    key,
    user.id,
    passwordFingerprint(user.password),
    formatDbDatetime(nowMicros() + SESSION_AGE_SECONDS * 1_000_000),
  );
  await db.run('UPDATE auth_user SET last_login = ? WHERE id = ?', nowDb(), user.id);
  dropQueuedSessionCookie(res);
  res.cookie(SESSION_COOKIE, key, { ...cookieOptions(req), maxAge: SESSION_AGE_SECONDS * 1000 });
  req.sessionKey = key;
  req.user = user;
}

/** Logout: drops the session and clears the cookie if one was sent. */
export async function endSession(db, req, res) {
  if (req.sessionKey) await db.run('DELETE FROM node_session WHERE session_key = ?', req.sessionKey);
  dropQueuedSessionCookie(res);
  if (readCookie(req, SESSION_COOKIE) !== null) res.clearCookie(SESSION_COOKIE, cookieOptions(req));
  req.sessionKey = null;
  req.user = null;
}

/** Sets req.user from the session cookie; clears cookies of sessions that no longer exist. */
export function authenticate(db) {
  return async (req, res, next) => {
    req.user = null;
    const cookieKey = readCookie(req, SESSION_COOKIE);
    req.sessionKey = cookieKey && /^[0-9a-f]{40}$/.test(cookieKey) ? cookieKey : null;
    if (cookieKey !== null) {
      const session = req.sessionKey ? await sessionUser(db, req.sessionKey) : SESSION_GONE;
      if (session === SESSION_GONE) {
        req.sessionKey = null;
        res.clearCookie(SESSION_COOKIE, cookieOptions(req));
      } else if (session) {
        req.user = session;
      }
    }
    next();
  };
}

/** Rejects requests without a signed-in user, except for the login/session endpoints. */
export function requireLogin(req, res, next) {
  const path = (req.path.replace(/\/+$/, '') || '/').toLowerCase();
  if (req.user || req.method === 'OPTIONS' || PUBLIC_PATHS.has(path)) return next();
  return res.status(401).json({ detail: 'Authentication credentials were not provided.' });
}

/** True when the signed-in user is an administrator. */
export function isAdminRequest(req) {
  return isAdmin(req.user);
}
