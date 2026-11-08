import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { authenticate, requireLogin } from './auth.js';
import { DEFAULT_CORS_ORIGINS } from './config.js';
import { HttpError, route } from './http.js';
import { authRoutes } from './routes/auth.js';
import { importRoutes } from './routes/imports.js';
import { reportRoutes } from './routes/reports.js';
import { taskRoutes } from './routes/tasks.js';

const consoleLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

const DEFAULT_SECURITY = Object.freeze({
  showOtpOnScreen: false,
  corsAllowedOrigins: DEFAULT_CORS_ORIGINS,
  sessionCookieSecure: false,
});

// Response headers sent on every response.
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
}

/**
 * Blocks state-changing requests that a browser marks as coming from another site, unless that
 * site is an allowed origin. The app's own pages (served through the Vite proxy) are same-origin.
 */
function crossSiteGuard(allowedOrigins) {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (req, res, next) => {
    if (safeMethods.has(req.method)) return next();
    const site = req.get('sec-fetch-site');
    if (site === undefined || site === 'same-origin' || site === 'none') return next();
    if (allowedOrigins.has(req.get('origin'))) return next();
    return res.status(403).json({ detail: 'Cross-site request blocked.' });
  };
}

function requestLog(logger) {
  return (req, res, next) => {
    res.on('finish', () => {
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const size = res.getHeader('content-length') ?? '-';
      logger.info(`[${stamp}] "${req.method} ${req.originalUrl} HTTP/${req.httpVersion}" ${res.statusCode} ${size}`);
    });
    next();
  };
}

// Repeated form fields keep their last value.
function lastFormValues(req, res, next) {
  if (req.is('application/x-www-form-urlencoded') && req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) if (Array.isArray(value)) req.body[key] = value.at(-1);
  }
  next();
}

export function createApp({ db, mailer, logger = consoleLogger, debug = false, security = {} }) {
  const settings = { ...DEFAULT_SECURITY, ...security };
  const allowedOrigins = new Set(settings.corsAllowedOrigins);

  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.locals.secureCookies = settings.sessionCookieSecure;
  app.use(requestLog(logger));
  app.use(securityHeaders);
  app.use(
    cors({
      origin: [...allowedOrigins],
      credentials: true,
      methods: ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
      allowedHeaders: ['accept', 'authorization', 'content-type', 'user-agent', 'x-csrftoken', 'x-requested-with', 'x-current-user'],
      maxAge: 86400,
      optionsSuccessStatus: 200,
    }),
  );

  const api = express.Router();
  api.use(crossSiteGuard(allowedOrigins));
  api.use(express.json({ limit: '10mb', strict: false }));
  api.use(express.urlencoded({ extended: false, limit: '10mb' }));
  api.use(lastFormValues);
  api.use(authenticate(db));
  api.use(requireLogin);

  route(api, '/', {
    get: (req, res) => res.json({ tasks: `${req.protocol}://${req.get('host')}/api/tasks/` }),
  });
  const deps = { db, mailer, logger, security: settings };
  api.use(authRoutes(deps));
  api.use(taskRoutes(deps));
  api.use(reportRoutes(deps));
  api.use(importRoutes(deps));
  app.use('/api', api);

  app.use((req, res) => res.status(404).json({ detail: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ detail: `JSON parse error - ${err.message}` });
    if (err.type === 'entity.too.large') return res.status(413).json({ detail: 'Request body is too large.' });
    if (err instanceof multer.MulterError) return res.status(400).json({ detail: err.message });
    logger.error(`[${req.method} ${req.originalUrl}] ${err?.stack ?? err}`);
    return res.status(500).json({ detail: debug ? `Server error: ${err?.message ?? err}` : 'A server error occurred.' });
  });

  return app;
}
