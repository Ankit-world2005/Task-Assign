// Django-compatible password hashes: pbkdf2_sha256$<iterations>$<salt>$<base64 hash>.
// Existing users keep their passwords.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(crypto.pbkdf2);

const ALGORITHM = 'pbkdf2_sha256';
const ITERATIONS = 1_000_000; // Django 5.2 default
const SALT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SALT_LENGTH = 22;

async function derive(raw, salt, iterations) {
  const key = await pbkdf2(raw, salt, iterations, 32, 'sha256');
  return key.toString('base64');
}

export async function makePassword(raw) {
  let salt = '';
  for (let i = 0; i < SALT_LENGTH; i++) salt += SALT_CHARS[crypto.randomInt(SALT_CHARS.length)];
  return `${ALGORITHM}$${ITERATIONS}$${salt}$${await derive(raw, salt, ITERATIONS)}`;
}

/** Returns { valid, mustUpdate }; mustUpdate when the hash uses an older iteration count. */
export async function checkPassword(raw, encoded) {
  const parts = typeof encoded === 'string' ? encoded.split('$') : [];
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return { valid: false, mustUpdate: false };
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1) return { valid: false, mustUpdate: false };
  const expected = Buffer.from(parts[3]);
  const actual = Buffer.from(await derive(raw, parts[2], iterations));
  const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  return { valid, mustUpdate: valid && iterations !== ITERATIONS };
}
