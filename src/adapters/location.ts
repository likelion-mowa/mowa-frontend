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

  async getCurrentPlace() {
    // Reporting this as unsupported rather than reaching for navigator
    // .geolocation is deliberate, and not only for consistency with the two
    // methods above: expo-location's reverse geocoding was removed in SDK 49
    // and resolves to an empty array on web, so a position read here could
    // never produce the place name this call exists to return.
    //
    // The absence of an expo-location import in THIS file is also what keeps
    // the package out of the web bundle — Gate 4 asserts both halves.
    return { ok: false, error: 'Reading a place requires CoreLocation and is iOS-only.' };
  },
};
