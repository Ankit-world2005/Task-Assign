import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { likeEscape } from '../lib/py.js';

const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sqlite.sql');
const LIKE = "LIKE ? ESCAPE '\\'";

// SQLite has no boolean type; Django stores booleans as 1/0.
function bindable(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/**
 * SQLite through Node's built-in driver. Queries are synchronous underneath; a promise
 * chain makes sure no other request's statement runs inside an open transaction.
 */
export class SqliteDatabase {
  dialect = 'sqlite';
  #raw;
  #statements = new Map();
  #lock = Promise.resolve();
  #tx;

  constructor(file) {
    this.#raw = new DatabaseSync(file);
    // Connection settings Django's SQLite backend uses.
    this.#raw.exec('PRAGMA foreign_keys = ON');
    this.#raw.exec('PRAGMA busy_timeout = 5000');
    this.#raw.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    this.#tx = this.#handle();
  }

  #execute(kind, sql, params) {
    let statement = this.#statements.get(sql);
    if (!statement) {
      statement = this.#raw.prepare(sql);
      this.#statements.set(sql, statement);
    }
    const values = params.map(bindable);
    if (kind === 'get') return statement.get(...values) ?? null;
    if (kind === 'all') return statement.all(...values);
    const result = statement.run(...values);
    return { changes: Number(result.changes) };
  }

  /** Query interface used inside a transaction (no locking). */
  #handle() {
    const handle = {
      dialect: this.dialect,
      get: async (sql, ...params) => this.#execute('get', sql, params),
      all: async (sql, ...params) => this.#execute('all', sql, params),
      run: async (sql, ...params) => this.#execute('run', sql, params),
      transaction: (fn) => fn(handle),
      hasTable: (name) => this.#hasTable(name),
      iexact: (column) => this.iexact(column),
      iexactValue: (value) => this.iexactValue(value),
      icontains: (column) => this.icontains(column),
    };
    return handle;
  }

  async get(sql, ...params) {
    await this.#lock;
    return this.#execute('get', sql, params);
  }

  async all(sql, ...params) {
    await this.#lock;
    return this.#execute('all', sql, params);
  }

  async run(sql, ...params) {
    await this.#lock;
    return this.#execute('run', sql, params);
  }

  /** Runs `fn(tx)` in one transaction; rolls back if it throws. */
  transaction(fn) {
    const result = this.#lock.then(async () => {
      this.#raw.exec('BEGIN');
      try {
        const value = await fn(this.#tx);
        this.#raw.exec('COMMIT');
        return value;
      } catch (err) {
        this.#raw.exec('ROLLBACK');
        throw err;
      }
    });
    this.#lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #hasTable(name) {
    return Boolean(this.#execute('get', "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));
  }

  async hasTable(name) {
    await this.#lock;
    return this.#hasTable(name);
  }

  // Django's SQLite lookups: iexact and icontains both use LIKE with escaped wildcards.
  iexact(column) {
    return `${column} ${LIKE}`;
  }

  iexactValue(value) {
    return likeEscape(value);
  }

  icontains(column) {
    return `${column} ${LIKE}`;
  }

  async close() {
    await this.#lock;
    this.#raw.close();
  }
}
