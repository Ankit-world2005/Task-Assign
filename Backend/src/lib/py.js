// Small helpers that reproduce the Python semantics the original views relied on
// (truthiness, str(), int()), so request handling behaves exactly as before.

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** Python truthiness for JSON / spreadsheet values. */
export function isTruthy(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** Python str() of a value. Dates format like str(datetime). */
export function pyStr(value) {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) {
    const base =
      `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
      `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
    const ms = value.getUTCMilliseconds();
    return ms ? `${base}.${pad(ms, 3)}000` : base;
  }
  return JSON.stringify(value);
}

/** Python type(value).__name__ for JSON values (used in validation messages). */
export function pyTypeName(value) {
  if (value === null || value === undefined) return 'NoneType';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value === 'string') return 'str';
  if (Array.isArray(value)) return 'list';
  return 'dict';
}

/** Python int(); returns null where Python would raise. */
export function pyInt(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'string' && /^\s*[+-]?\d+(_\d+)*\s*$/.test(value)) {
    return Number.parseInt(value.replace(/_/g, ''), 10);
  }
  return null;
}

/** `request.data.get(key, default).strip()`: a missing or null value gives the default. */
export function strField(data, key, fallback = '') {
  const value = data[key];
  if (value === undefined || value === null) return fallback.trim();
  return pyStr(value).trim();
}

/** Python slicing by code point: value[:n]. */
export function sliceChars(value, n) {
  return value.length <= n ? value : Array.from(value).slice(0, n).join('');
}

export function charLength(value) {
  return Array.from(value).length;
}

/** Escapes LIKE wildcards the way Django does for case-insensitive lookups. */
export function likeEscape(value) {
  return pyStr(value).replace(/[\\%_]/g, '\\$&');
}

/** Parameter for an icontains lookup. */
export function likeContains(value) {
  return `%${likeEscape(value)}%`;
}
