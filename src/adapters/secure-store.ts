import { toError, type SecureStorePort } from './types';

/**
 * WEB implementation, and the file `tsc` resolves.
 *
 * Backed by localStorage. There is no browser equivalent of a keychain, so
 * `isSecure` is false and callers must not assume the value is protected: on
 * web the token is readable by any script on the origin. That is the same
 * exposure a cookie-less SPA already has, and the deployed web build is the
 * UI-only delivery (AGENTS.md), so it is accepted rather than worked around.
 *
 * Falls back to an in-memory Map when localStorage is unavailable (Safari with
 * cookies fully blocked, private mode quota errors, SSR during static render) —
 * the same probe `storage.ts` uses, for the same reason.
 */
const memory = new Map<string, string>();

function canUseLocalStorage(): boolean {
  try {
    if (typeof globalThis.localStorage === 'undefined') return false;
    // Safari with "Block All Cookies" throws on access rather than returning null.
    const probe = '__mowa_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export const secureStore: SecureStorePort = {
  isSecure: false,

  async getItem(key) {
    try {
      if (!canUseLocalStorage()) return { ok: true, value: memory.get(key) ?? null };
      return { ok: true, value: globalThis.localStorage.getItem(key) };
    } catch (error) {
      return toError(error);
    }
  },

  async setItem(key, value) {
    try {
      if (!canUseLocalStorage()) {
        memory.set(key, value);
        return { ok: true, value: true };
      }
      globalThis.localStorage.setItem(key, value);
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },

  async deleteItem(key) {
    try {
      memory.delete(key);
      if (canUseLocalStorage()) globalThis.localStorage.removeItem(key);
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },
};
