import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pyStr } from '../lib/py.js';

const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.postgres.sql');

const INT8 = 20;
const DATE = 1082;
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;

// bigint ids/counts as numbers; dates and timestamps as the raw text the rest of the code expects.
const types = {
  getTypeParser(oid, format) {
    if (oid === INT8) return (value) => (value === null ? null : Number(value));
    if (oid === DATE || oid === TIMESTAMP || oid === TIMESTAMPTZ) return (value) => value;
    return pg.types.getTypeParser(oid, format);
  },
};

/** Rewrites '?' placeholders as $1, $2, ... (outside quoted strings). */
function numberPlaceholders(sql) {
  let index = 0;
  let inQuote = false;
  let out = '';
  for (const c of sql) {
    if (c === "'") inQuote = !inQuote;
    out += c === '?' && !inQuote ? `$${++index}` : c;
  }
  return out;
}

const bindable = (value) => (value === undefined ? null : value);

/** PostgreSQL through a `pg` connection pool, with the session time zone set to UTC like Django. */
export class PostgresDatabase {
  dialect = 'postgres';
  #pool;

  constructor({ host, port, user, password, name }) {
    this.#pool = new pg.Pool({ host, port, user, password, database: name, types, options: '-c TimeZone=UTC' });
  }

  async init() {
    await this.#pool.query(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  }

  #handle(client) {
    const query = async (sql, params) => client.query(numberPlaceholders(sql), params.map(bindable));
    const handle = {
      dialect: this.dialect,
      get: async (sql, ...params) => (await query(sql, params)).rows[0] ?? null,
      all: async (sql, ...params) => (await query(sql, params)).rows,
      run: async (sql, ...params) => ({ changes: (await query(sql, params)).rowCount }),
      transaction: (fn) => fn(handle),
      hasTable: async (name) => Boolean((await query('SELECT to_regclass(?) IS NOT NULL AS found', [name])).rows[0].found),
      iexact: (column) => this.iexact(column),
      iexactValue: (value) => this.iexactValue(value),
      icontains: (column) => this.icontains(column),
    };
    return handle;
  }

  get(sql, ...params) {
    return this.#handle(this.#pool).get(sql, ...params);
  }

  all(sql, ...params) {
    return this.#handle(this.#pool).all(sql, ...params);
  }

  run(sql, ...params) {
    return this.#handle(this.#pool).run(sql, ...params);
  }

  hasTable(name) {
    return this.#handle(this.#pool).hasTable(name);
  }

  /** Runs `fn(tx)` on one pooled connection inside a transaction; rolls back if it throws. */
  async transaction(fn) {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(this.#handle(client));
      await client.query('COMMIT');
      return value;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // Django's PostgreSQL lookups: UPPER(col::text) = UPPER(%s) and UPPER(col::text) LIKE UPPER(%s).
  iexact(column) {
    return `UPPER(${column}::text) = UPPER(?)`;
  }

  iexactValue(value) {
    return pyStr(value);
  }

  icontains(column) {
    return `UPPER(${column}::text) LIKE UPPER(?)`;
  }

  async close() {
    await this.#pool.end();
  }
}
