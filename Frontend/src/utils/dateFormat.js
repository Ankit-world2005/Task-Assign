// Every date in the app is shown as MM/DD/YYYY. The API keeps ISO dates (YYYY-MM-DD).

const pad = (n) => String(n).padStart(2, '0');

const toDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// 'YYYY-MM-DD', an ISO timestamp or a Date -> 'MM/DD/YYYY' (fallback when empty or invalid)
export const formatDate = (value, fallback = '') => {
  if (!value) return fallback;
  // Plain calendar dates are reformatted directly so the time zone can't shift the day
  const isoDate = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoDate) return `${isoDate[2]}/${isoDate[3]}/${isoDate[1]}`;
  const d = toDate(value);
  return d ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` : fallback;
};

// Timestamp -> 'hh:mm AM'
export const formatTime = (value, fallback = '') => {
  const d = value ? toDate(value) : null;
  return d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : fallback;
};

// Timestamp -> 'MM/DD/YYYY hh:mm AM'
export const formatDateTime = (value, fallback = '') => {
  const d = value ? toDate(value) : null;
  return d ? `${formatDate(d)} ${formatTime(d)}` : fallback;
};

// 'MM/DD/YYYY' -> 'YYYY-MM-DD', or null when it isn't a real calendar date
export const parseUsDate = (text) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text || '');
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const isRealDate =
    d.getUTCFullYear() === Number(yyyy) && d.getUTCMonth() === Number(mm) - 1 && d.getUTCDate() === Number(dd);
  return isRealDate ? `${yyyy}-${mm}-${dd}` : null;
};
