// Vercel serverless entrypoint wrapping the Express app without calling app.listen().
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../Backend/src/app.js';
import { config } from '../Backend/src/config.js';
import { openDatabase } from '../Backend/src/db/index.js';
import { createMailer } from '../Backend/src/email.js';

const isTruthyEnv = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

/** Restores the original `/api/...` path when Vercel rewrites `/api/(.*)` -> `/api/index?__path=...`. */
export function normalizeServerlessUrl(rawUrl = '/') {
  const url = new URL(rawUrl, 'http://localhost');
  const rewrittenPath = url.searchParams.get('__path');
  if (rewrittenPath === null) return rawUrl;
  url.searchParams.delete('__path');
  const query = url.searchParams.toString();
  const basePath =
    url.pathname === '/api/index' || url.pathname === '/api'
      ? `/api/${rewrittenPath.replace(/^\/+/, '')}`
      : url.pathname;
  return `${basePath}${query ? `?${query}` : ''}`;
}

function buildServerlessSecurity() {
  const vercelHosts = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .filter(Boolean)
    .map((host) => (host.startsWith('http') ? host : `https://${host}`).replace(/\/+$/, ''));

  return {
    showOtpOnScreen: config.security.showOtpOnScreen || isTruthyEnv(process.env.OTP_SCREEN_FALLBACK),
    corsAllowedOrigins: [...new Set([...config.security.corsAllowedOrigins, ...vercelHosts])],
    sessionCookieSecure:
      process.env.SESSION_COOKIE_SECURE !== undefined ? config.security.sessionCookieSecure : Boolean(process.env.VERCEL),
  };
}

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const dbConfig =
        config.database.engine === 'sqlite' && process.env.VERCEL
          ? { engine: 'sqlite', path: path.join(os.tmpdir(), 'us24-portal.sqlite3') }
          : config.database;
      const db = await openDatabase(dbConfig);
      const app = createApp({
        db,
        mailer: createMailer(config.email),
        debug: config.debug,
        security: buildServerlessSecurity(),
      });
      app.set('trust proxy', 1);
      return app;
    })().catch((err) => {
      // Clear cached promise on cold-start failure so subsequent invocations can recover cleanly.
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  req.url = normalizeServerlessUrl(req.url);
  const app = await getApp();
  return app(req, res);
}
