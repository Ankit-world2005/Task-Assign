import { PostgresDatabase } from './postgres.js';
import { SqliteDatabase } from './sqlite.js';

/**
 * Opens the configured database and makes sure the tables exist.
 * Both drivers expose the same async interface: get / all / run / transaction / hasTable,
 * plus iexact / iexactValue / icontains for case-insensitive lookups.
 */
export async function openDatabase(databaseConfig) {
  if (databaseConfig.engine === 'postgres') {
    const db = new PostgresDatabase(databaseConfig);
    await db.init();
    return db;
  }
  return new SqliteDatabase(databaseConfig.path);
}

export function describeDatabase(databaseConfig) {
  return databaseConfig.engine === 'postgres'
    ? `PostgreSQL ${databaseConfig.user}@${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.name}`
    : `SQLite ${databaseConfig.path}`;
}
