import * as SQLite from 'expo-sqlite';

import { toError, type StoragePort, type DetectedWalk } from './types';

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

      // `CREATE TABLE IF NOT EXISTS` alone is a trap here: a phone that ran the
      // previous build already has a `walks` table carrying `note` and lacking
      // `locationSummary` / `candidateId`. The create would no-op, and every
      // insert would then fail at runtime on a missing column while the web
      // build stayed green. PRAGMA user_version makes the upgrade explicit.
      //
      // v1 rows are dropped rather than migrated — they are scaffold detections
      // with no user-visible content, and `note` has no destination now that
      // the backend removed the column.
      const { user_version: version } = (await database.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      )) ?? { user_version: 0 };

      if (version < 1) {
        await database.execAsync(`
          DROP TABLE IF EXISTS walks;
          PRAGMA user_version = 1;
        `);
      }

      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS walks (
          id              TEXT PRIMARY KEY NOT NULL,
          startedAtMs     INTEGER NOT NULL,
          endedAtMs       INTEGER,
          steps           INTEGER NOT NULL DEFAULT 0,
          locationSummary TEXT,
          candidateId     TEXT
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
      const value = await database.getAllAsync<DetectedWalk>(
        `SELECT id, startedAtMs, endedAtMs, steps, locationSummary, candidateId
         FROM walks ORDER BY startedAtMs DESC`,
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
        `INSERT OR REPLACE INTO walks
           (id, startedAtMs, endedAtMs, steps, locationSummary, candidateId)
         VALUES (?, ?, ?, ?, ?, ?)`,
        record.id,
        record.startedAtMs,
        record.endedAtMs,
        record.steps,
        record.locationSummary,
        record.candidateId,
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
