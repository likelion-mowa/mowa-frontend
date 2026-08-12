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
    // The browser does expose navigator.geolocation, but this app only needs
    // location for walk detection, which is background-only and iOS-only.
    // Wiring foreground geolocation here would imply a capability the web
    // build does not actually have.
    return { ok: false, error: 'Location is only used by walk detection, which is iOS-only.' };
  },

  async requestBackgroundPermission() {
    return { ok: false, error: 'Background location is not available on web.' };
  },
};
