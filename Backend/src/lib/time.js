// The app runs in UTC (Django had TIME_ZONE='UTC', USE_TZ=True). Datetimes are stored as
// 'YYYY-MM-DD HH:MM:SS.ffffff' and returned by the API as 'YYYY-MM-DDTHH:MM:SS.ffffffZ'.

const pad = (n, width = 2) => String(n).padStart(width, '0');
const DATETIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?/;

let lastMicros = 0;

/** Current time in microseconds, strictly increasing so created_at ordering stays stable. */
export function nowMicros() {
  // Wall-clock milliseconds plus the sub-millisecond part of the high-resolution timer.
  let micros = Date.now() * 1000 + (Math.floor(performance.now() * 1000) % 1000);
  if (micros <= lastMicros) micros = lastMicros + 1;
  lastMicros = micros;
  return micros;
}

export function formatDbDatetime(micros) {
  const date = new Date(Math.floor(micros / 1000));
  const base = date.toISOString().slice(0, 19).replace('T', ' ');
  const fraction = micros % 1_000_000;
  return fraction ? `${base}.${pad(fraction, 6)}` : base;
}

export function nowDb() {
  return formatDbDatetime(nowMicros());
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function currentYear() {
  return new Date().getUTCFullYear();
}

/** Stored datetime (SQLite text or PostgreSQL timestamptz text) -> API ISO 8601 string. */
export function toApiDatetime(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = DATETIME.exec(String(value));
  if (!match) return String(value);
  const fraction = (match[3] ?? '').padEnd(6, '0');
  return `${match[1]}T${match[2]}${/^0*$/.test(fraction) ? '' : `.${fraction}`}Z`;
}

/** Stored datetime -> epoch milliseconds. */
export function dbDatetimeToMs(value) {
  const match = DATETIME.exec(String(value));
  if (!match) return Number.NaN;
  const ms = (match[3] ?? '').padEnd(3, '0').slice(0, 3);
  return Date.parse(`${match[1]}T${match[2]}.${ms}Z`);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** 'YYYY-MM-DD', or null when the date doesn't exist (like Python's date()). */
export function makeIsoDate(year, month, day) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Django's parse_date(): 'YYYY-MM-DD', 'YYYYMMDD' or 'YYYY-M-D'. Null when invalid. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ||
    /^(\d{4})(\d{2})(\d{2})$/.exec(value) ||
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) return null;
  return makeIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(year, month - 1, day + days);
  return makeIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** 'YYYY-MM-DD' -> 'MM/DD/YYYY'. */
export function toUsDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = String(isoDate).split('-');
  return `${month}/${day}/${year}`;
}
