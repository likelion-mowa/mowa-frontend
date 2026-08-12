import * as SQLite from 'expo-sqlite';

import { toError, type StoragePort, type WalkRecord } from './types';

/**
 * iOS persistence.
 *
 * Async API only. expo-sqlite's synchronous bridge has open defects on some
 * platforms, and `openDatabaseSync` at module scope can deadlock — so the
 * database is opened lazily inside `init()`.
 */
let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('mowa.db');
  }
  return db;
}

export const storage: StoragePort = {
  isPersistent: true,

  async init() {
    try {
      const database = await getDb();
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS walks (
          id           TEXT PRIMARY KEY NOT NULL,
          startedAtMs  INTEGER NOT NULL,
          endedAtMs    INTEGER,
          steps        INTEGER NOT NULL DEFAULT 0,
          note         TEXT
        );
      `);
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },

  async listWalks() {
    try {
      const database = await getDb();
      const value = await database.getAllAsync<WalkRecord>(
        'SELECT id, startedAtMs, endedAtMs, steps, note FROM walks ORDER BY startedAtMs DESC',
      );
      return { ok: true, value };
    } catch (error) {
      return toError(error);
    }
  },

  async insertWalk(record) {
    try {
      const database = await getDb();
      await database.runAsync(
        `INSERT OR REPLACE INTO walks (id, startedAtMs, endedAtMs, steps, note)
         VALUES (?, ?, ?, ?, ?)`,
        record.id,
        record.startedAtMs,
        record.endedAtMs,
        record.steps,
        record.note,
      );
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },

  async clear() {
    try {
      const database = await getDb();
      await database.execAsync('DELETE FROM walks;');
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },
};
