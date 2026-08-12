import type { StoragePort, WalkRecord } from './types';

/**
 * WEB implementation, and the file `tsc` resolves.
 *
 * Deliberately an in-memory mock rather than expo-sqlite's web backend. That
 * backend is wa-sqlite/OPFS, marked alpha by Expo, and needs
 * `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` response
 * headers that `expo export` does not emit — so it would work in `expo start`
 * and then fail on the deployed static site.
 *
 * Web is the demo/fallback target, so mock data is the correct trade.
 */
const rows = new Map<string, WalkRecord>();

export const storage: StoragePort = {
  isPersistent: false,

  async init() {
    return { ok: true, value: true };
  },

  async listWalks() {
    const value = [...rows.values()].sort((a, b) => b.startedAtMs - a.startedAtMs);
    return { ok: true, value };
  },

  async insertWalk(record) {
    rows.set(record.id, record);
    return { ok: true, value: true };
  },

  async clear() {
    rows.clear();
    return { ok: true, value: true };
  },
};
