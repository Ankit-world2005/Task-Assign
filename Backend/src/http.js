import { isPlainObject } from './lib/py.js';

export class HttpError extends Error {
  constructor(status, body) {
    super(typeof body?.detail === 'string' ? body.detail : `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** The parsed request body as an object. */
export function requestData(req) {
  const body = req.body;
  if (body === undefined || body === null) return {};
  if (!isPlainObject(body)) throw new HttpError(400, { detail: 'Request body must be a JSON object.' });
  return body;
}

/** A numeric URL segment (user ids); anything else is a 404. */
export function intParam(value) {
  if (!/^\d+$/.test(value)) throw new HttpError(404, { detail: 'Not found.' });
  return Number.parseInt(value, 10);
}

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** Registers handlers for one path; other methods get a 405 with an Allow header. */
export function route(router, path, handlers) {
  const chain = router.route(path);
  const methods = Object.keys(handlers).map((m) => m.toUpperCase());
  if (methods.includes('GET')) methods.push('HEAD');
  methods.push('OPTIONS');
  const allow = METHOD_ORDER.filter((m) => methods.includes(m)).join(', ');
  for (const [method, handler] of Object.entries(handlers)) chain[method](handler);
  chain.all((req, res) => {
    res.set('Allow', allow);
    if (req.method === 'OPTIONS') return res.status(200).end();
    return res.status(405).json({ detail: `Method "${req.method}" not allowed.` });
  });
}
