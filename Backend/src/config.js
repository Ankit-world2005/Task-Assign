import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Like python-dotenv's load_dotenv(): the file is optional and real environment variables win.
try {
  process.loadEnvFile(path.join(ROOT_DIR, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const env = process.env;
const emailUser = (env.EMAIL_HOST_USER ?? '').trim();
const emailPassword = (env.EMAIL_HOST_PASSWORD ?? '').trim();
const smtpEnabled = Boolean(emailUser && emailPassword);

// Same rule as the Django settings: PostgreSQL when DB_ENGINE=postgres or DB_NAME is set, else SQLite.
const usePostgres = (env.DB_ENGINE ?? '') === 'postgres' || Boolean(env.DB_NAME);

const isOn = (value) => ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

// Browser origins allowed to call the API from another address (the Vite dev server proxies /api,
// so the app itself never needs this). Add a deployed frontend's URL via CORS_ALLOWED_ORIGINS.
export const DEFAULT_CORS_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

export const config = {
  host: env.HOST || '127.0.0.1',
  port: Number.parseInt(env.PORT || '8001', 10),
  debug: (env.DEBUG ?? 'True') === 'True',
  security: {
    // Testing aid: send the login code back so the login page shows it. Never enable in real use.
    showOtpOnScreen: isOn(env.SHOW_OTP_ON_SCREEN),
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS
      ? env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
      : [...DEFAULT_CORS_ORIGINS],
    // Set when the site is served over HTTPS so the session cookie is never sent over plain HTTP.
    sessionCookieSecure: isOn(env.SESSION_COOKIE_SECURE),
  },
  database: usePostgres
    ? {
        engine: 'postgres',
        name: env.DB_NAME ?? 'us24_db',
        user: env.DB_USER ?? 'postgres',
        password: env.DB_PASSWORD ?? 'postgres',
        host: env.DB_HOST ?? 'localhost',
        port: Number.parseInt(env.DB_PORT ?? '5432', 10),
      }
    : {
        engine: 'sqlite',
        path: path.resolve(ROOT_DIR, env.DATABASE_PATH || 'db.sqlite3'),
      },
  email: {
    // Without SMTP credentials, OTP emails are printed in the server console.
    smtpEnabled,
    host: smtpEnabled ? env.EMAIL_HOST || 'smtp.gmail.com' : 'smtp.gmail.com',
    port: smtpEnabled ? Number.parseInt(env.EMAIL_PORT || '587', 10) : 587,
    useTls: smtpEnabled ? ['true', '1', 'yes'].includes((env.EMAIL_USE_TLS ?? 'True').toLowerCase()) : true,
    user: emailUser,
    password: emailPassword,
    from: env.DEFAULT_FROM_EMAIL ?? `US24 Portal Security <${emailUser || 'no-reply@us24solutions.com'}>`,
  },
};
