// /api/auth/* - two-step login (password, then emailed OTP) and admin user management.
import crypto from 'node:crypto';
import express from 'express';
import { endSession, isAdminRequest, startSession } from '../auth.js';
import { HttpError, intParam, requestData, route } from '../http.js';
import { checkPassword, makePassword } from '../lib/passwords.js';
import { FailureCounter } from '../lib/rateLimit.js';
import { charLength, isTruthy, pyStr, strField } from '../lib/py.js';
import { dbDatetimeToMs, nowDb } from '../lib/time.js';
import {
  deleteUser,
  emailTaken,
  findUserByLogin,
  getOrCreateProfile,
  getUserById,
  insertUser,
  listUsers,
  saveProfile,
  saveUser,
  usernameTaken,
  verifyUserPassword,
} from '../models/users.js';
import { serializeUser } from '../serializers.js';

const OTP_TTL_SECONDS = 600;
const OTP_MAX_ATTEMPTS = 5;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const INVALID_LOGIN = 'Invalid username or password.';
const INVALID_OTP = 'Invalid OTP code. Please check your email and try again.';
const REVOKED_DETAIL =
  'Your portal login access has been revoked or deactivated. Please contact your system administrator.';

function otpEmail(user, otp, targetEmail) {
  const text =
    `Hello ${user.first_name || user.username},\n\n` +
    'Your 2-Step Verification Code for US24 Healthcare Operations Portal is:\n\n' +
    `      ${otp}\n\n` +
    'This verification code expires in 10 minutes.\n' +
    'If you did not request this code, please ignore this email.\n\n' +
    'US24 Solutions Portal Operations Security';
  const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #070c18; padding: 32px; border-radius: 12px; color: #f8fafc; max-width: 520px; border: 1px solid rgba(56, 189, 248, 0.2);">
                <div style="margin-bottom: 20px;">
                    <span style="background: #2563eb; color: #fff; font-weight: 800; font-size: 15px; padding: 5px 12px; border-radius: 6px; margin-right: 10px;">US24</span>
                    <span style="font-size: 17px; font-weight: 700; color: #38bdf8;">SOLUTIONS PORTAL</span>
                </div>
                <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #ffffff;">Two-Step Verification Code</h2>
                <p style="font-size: 14px; color: #94a3b8; margin: 0 0 20px 0;">Use the 6-digit OTP below to securely sign in to your administrator dashboard.</p>

                <div style="background: rgba(15, 23, 42, 0.95); border: 2px dashed #38bdf8; border-radius: 10px; padding: 22px; text-align: center; margin-bottom: 22px;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8; margin-bottom: 6px; font-weight: 600;">One-Time Security Passcode</div>
                    <div style="font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #ffffff; font-family: monospace;">${otp}</div>
                </div>

                <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 16px 0;">
                    * This code will expire in <strong>10 minutes</strong>. Never share this code with anyone.
                </p>
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 12px; font-size: 11px; color: #475569;">
                    Target: ${escapeHtml(targetEmail)} - Automated Identity Service
                </div>
            </div>
            `;
  return { subject: '[US24 Portal] Your Two-Step Verification OTP Code', text, html };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Form-style boolean: "false", "0", "no", "off" and "" are false (plain JSON values use truthiness). */
function toBool(value) {
  if (typeof value === 'string') return !['false', '0', 'no', 'off', ''].includes(value.trim().toLowerCase());
  return isTruthy(value);
}

function sameCode(stored, given) {
  const a = Buffer.from(String(stored));
  const b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** URL id check, then the admin check, then the 404 lookup. */
async function adminTargetUser(db, req, forbiddenDetail) {
  const userId = intParam(req.params.userId);
  if (!isAdminRequest(req)) throw new HttpError(403, { detail: forbiddenDetail });
  const user = await getUserById(db, userId);
  if (!user) throw new HttpError(404, { detail: 'No User matches the given query.' });
  return user;
}

export function authRoutes({ db, mailer, logger, security }) {
  const router = express.Router();
  const loginFailures = new FailureCounter({ limit: LOGIN_MAX_FAILURES, windowMs: LOGIN_WINDOW_MS });
  const otpFailures = new FailureCounter({ limit: OTP_MAX_ATTEMPTS, windowMs: OTP_TTL_SECONDS * 1000 });
  // Checked for unknown usernames too, so response time doesn't reveal which accounts exist.
  const dummyHash = makePassword(crypto.randomUUID());

  // Step 1: check the password, store a 6-digit OTP and email it.
  route(router, '/auth/login', {
    post: async (req, res) => {
      const data = requestData(req);
      const username = strField(data, 'username');
      const password = strField(data, 'password');
      if (!username || !password) return res.status(400).json({ detail: 'Username/Email and password are required.' });

      const limitKey = `${req.ip}|${username.toLowerCase()}`;
      if (loginFailures.isBlocked(limitKey)) {
        return res.status(429).json({
          detail: `Too many failed sign-in attempts. Please wait ${loginFailures.minutesLeft(limitKey)} minute(s) and try again.`,
        });
      }

      const user = await findUserByLogin(db, username);
      const passwordOk = user ? await verifyUserPassword(db, user, password) : (await checkPassword(password, await dummyHash), false);
      if (!passwordOk) {
        loginFailures.fail(limitKey);
        return res.status(401).json({ detail: INVALID_LOGIN });
      }
      loginFailures.reset(limitKey);
      if (!user.is_active) return res.status(403).json({ detail: REVOKED_DETAIL });

      const otp = String(crypto.randomInt(100000, 1000000));
      const profile = await getOrCreateProfile(db, user.id);
      profile.current_otp = otp;
      profile.otp_created_at = nowDb();
      await saveProfile(db, profile);
      otpFailures.reset(user.id);

      const targetEmail = user.email || (username.includes('@') ? username : null);
      let emailSent = false;
      let emailError = null;
      if (targetEmail) {
        try {
          await mailer.send({ to: targetEmail, ...otpEmail(user, otp, targetEmail) });
          emailSent = true;
          logger.info(`Sent OTP email to ${targetEmail}`);
        } catch (err) {
          emailError = String(err?.message ?? err);
          logger.warn(`Could not send email to ${targetEmail}: ${emailError}`);
        }
      }

      const body = {
        success: true,
        message: emailSent ? `OTP sent to ${targetEmail}` : `OTP generated for ${pyStr(targetEmail)}`,
        username: user.username,
        email: targetEmail,
        email_sent: emailSent,
        email_error: emailError,
        phone: profile.phone || '+1 (800) US24-PORTAL',
      };
      // Testing aid only (SHOW_OTP_ON_SCREEN=True): lets the login page show the code.
      if (security.showOtpOnScreen) body.otp = otp;
      return res.json(body);
    },
  });

  // Step 2: verify the OTP (10-minute expiry, 5 attempts) and start the session.
  route(router, '/auth/verify-otp', {
    post: async (req, res) => {
      const data = requestData(req);
      const username = strField(data, 'username');
      const otp = strField(data, 'otp');
      if (!username || !otp) return res.status(400).json({ detail: 'Username/Email and OTP are required.' });

      const user = await findUserByLogin(db, username);
      const profile = user?.profile;
      if (!profile || !profile.current_otp) return res.status(400).json({ detail: INVALID_OTP });

      const clearCode = () => db.run('UPDATE tasks_userprofile SET current_otp = NULL WHERE id = ?', profile.id);
      if (!profile.otp_created_at || (Date.now() - dbDatetimeToMs(profile.otp_created_at)) / 1000 > OTP_TTL_SECONDS) {
        await clearCode();
        return res.status(400).json({ detail: 'OTP has expired (10 min limit). Please request a new code.' });
      }
      if (!sameCode(profile.current_otp, otp)) {
        if (otpFailures.fail(user.id) >= OTP_MAX_ATTEMPTS) {
          await clearCode();
          otpFailures.reset(user.id);
          return res.status(400).json({ detail: 'Too many incorrect codes. Please sign in again to get a new code.' });
        }
        return res.status(400).json({ detail: INVALID_OTP });
      }
      if (!user.is_active) return res.status(403).json({ detail: REVOKED_DETAIL });

      await clearCode();
      otpFailures.reset(user.id);
      await startSession(db, req, res, user);
      return res.json({
        success: true,
        message: 'Two-Step Authentication successful',
        user: serializeUser(await getUserById(db, user.id)),
      });
    },
  });

  route(router, '/auth/me', {
    get: (req, res) =>
      res.json(req.user ? { authenticated: true, user: serializeUser(req.user) } : { authenticated: false, user: null }),
  });

  route(router, '/auth/logout', {
    post: async (req, res) => {
      await endSession(db, req, res);
      return res.json({ success: true, message: 'Logged out successfully.' });
    },
  });

  route(router, '/auth/users', {
    get: async (req, res) => res.json((await listUsers(db)).map(serializeUser)),
  });

  route(router, '/auth/users/create', {
    post: async (req, res) => {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ detail: 'Administrator privileges are required to create portal users.' });
      }
      const data = requestData(req);
      const username = strField(data, 'username');
      const email = strField(data, 'email');
      const password = strField(data, 'password');
      let role = strField(data, 'role', 'employee').toLowerCase();
      if (!['admin', 'employee'].includes(role)) role = 'employee';
      const isActive = 'is_active' in data ? toBool(data.is_active) : true;

      if (!username) return res.status(400).json({ detail: 'Username is required.' });
      if (!password || charLength(password) < 4) {
        return res.status(400).json({ detail: 'Password must be at least 4 characters long.' });
      }
      if (!email) return res.status(400).json({ detail: 'Email address is required for portal communications.' });
      if (await usernameTaken(db, username)) {
        return res.status(400).json({ detail: `A user with username "${username}" already exists.` });
      }
      if (await emailTaken(db, email)) {
        return res.status(400).json({ detail: `A user with email "${email}" already exists.` });
      }

      const passwordHash = await makePassword(password);
      const userId = await db.transaction(async (tx) => {
        const id = await insertUser(tx, {
          username,
          email,
          firstName: strField(data, 'first_name'),
          lastName: strField(data, 'last_name'),
          password: passwordHash,
          isActive,
          isAdmin: role === 'admin',
        });
        const profile = await getOrCreateProfile(tx, id);
        const suffix = String(id).padStart(2, '0');
        profile.role = role;
        profile.employee_id = strField(data, 'employee_id') || (role === 'admin' ? `US24-ADM${suffix}` : `US24-EMP${suffix}`);
        profile.phone = strField(data, 'phone');
        profile.department = strField(data, 'department', 'Operations & Enrollment');
        profile.avatar_color = strField(data, 'avatar_color', '#2563eb');
        await saveProfile(tx, profile);
        return id;
      });

      const user = await getUserById(db, userId);
      return res.status(201).json({
        success: true,
        message: `User "${user.username}" created successfully.`,
        user: serializeUser(user),
      });
    },
  });

  route(router, '/auth/users/:userId/toggle-access', {
    post: async (req, res) => {
      const user = await adminTargetUser(db, req, 'Administrator privileges are required to manage portal access.');
      if (req.user.id === user.id) {
        return res.status(400).json({ detail: 'Action blocked: You cannot revoke your own administrator login access.' });
      }
      user.is_active = !user.is_active;
      await saveUser(db, user);
      return res.json({
        success: true,
        message: `Portal login access has been ${user.is_active ? 'granted' : 'revoked'} for ${user.username}.`,
        is_active: user.is_active,
        user: serializeUser(await getUserById(db, user.id)),
      });
    },
  });

  const updateUser = async (req, res) => {
    const user = await adminTargetUser(db, req, 'Administrator privileges are required to update user accounts.');
    const data = requestData(req);
    const isSelf = req.user.id === user.id;

    if ('first_name' in data) user.first_name = strField(data, 'first_name');
    if ('last_name' in data) user.last_name = strField(data, 'last_name');
    if ('email' in data) {
      const newEmail = strField(data, 'email');
      if (newEmail && newEmail.toLowerCase() !== user.email.toLowerCase()) {
        if (await emailTaken(db, newEmail, user.id)) {
          return res.status(400).json({ detail: `Email "${newEmail}" is already in use.` });
        }
        user.email = newEmail;
      }
    }
    if ('is_active' in data) {
      if (isSelf && !toBool(data.is_active)) {
        return res.status(400).json({ detail: 'You cannot deactivate your own account.' });
      }
      user.is_active = toBool(data.is_active);
    }

    const profile = await getOrCreateProfile(db, user.id);
    if ('role' in data) {
      const newRole = strField(data, 'role').toLowerCase();
      if (['admin', 'employee'].includes(newRole)) {
        if (isSelf && newRole !== 'admin') {
          return res.status(400).json({ detail: 'You cannot remove your own administrator role.' });
        }
        profile.role = newRole;
        user.is_staff = user.is_superuser = newRole === 'admin';
      }
    }
    for (const field of ['employee_id', 'phone', 'department', 'avatar_color']) {
      if (field in data) profile[field] = strField(data, field);
    }

    await db.transaction(async (tx) => {
      await saveUser(tx, user);
      await saveProfile(tx, profile);
    });
    return res.json({
      success: true,
      message: `User ${user.username} updated successfully.`,
      user: serializeUser(await getUserById(db, user.id)),
    });
  };
  route(router, '/auth/users/:userId/update', { post: updateUser, put: updateUser, patch: updateUser });

  route(router, '/auth/users/:userId/reset-password', {
    post: async (req, res) => {
      const user = await adminTargetUser(db, req, 'Administrator privileges are required to reset user passwords.');
      const newPassword = strField(requestData(req), 'password');
      if (!newPassword || charLength(newPassword) < 4) {
        return res.status(400).json({ detail: 'Password must be at least 4 characters long.' });
      }
      await db.run('UPDATE auth_user SET password = ? WHERE id = ?', await makePassword(newPassword), user.id);
      return res.json({ success: true, message: `Password for ${user.username} has been updated successfully.` });
    },
  });

  const removeUser = async (req, res) => {
    const user = await adminTargetUser(db, req, 'Administrator privileges are required to delete users.');
    if (req.user.id === user.id) {
      return res.status(400).json({ detail: 'Action blocked: You cannot delete your own account.' });
    }
    await deleteUser(db, user.id);
    return res.json({ success: true, message: `User "${user.username}" has been removed from the portal.` });
  };
  route(router, '/auth/users/:userId/delete', { delete: removeUser, post: removeUser });

  return router;
}
