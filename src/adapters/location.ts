import type { LocationPort } from './types';

/** WEB implementation, and the file `tsc` resolves. */
const UNSUPPORTED = {
  foreground: 'unavailable' as const,
  background: 'unavailable' as const,
};

export const location: LocationPort = {
  isAvailable: false,

  async getPermission() {
    return { ok: true, value: UNSUPPORTED };
  },

  async requestForegroundPermission() {
    return { ok: false, error: 'Background location is not available on web.' };
  },

  async requestBackgroundPermission() {
    return { ok: false, error: 'Background location is not available on web.' };
  },
};
