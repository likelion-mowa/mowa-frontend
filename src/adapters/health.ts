import type { HealthPort } from './types';

/**
 * WEB implementation, and the file `tsc` resolves.
 *
 * HealthKit is iOS-only. Keeping `@kingstinct/react-native-healthkit` out of
 * this file is what keeps it (and its `react-native-nitro-modules` peer) out of
 * the web bundle. metro.config.js additionally hard-empties both packages for
 * the web platform as a second layer.
 */
export const health: HealthPort = {
  isAvailable: false,

  async getStatus() {
    return {
      ok: true,
      value: { isHealthDataAvailable: false, authorization: 'unavailable' as const },
    };
  },

  async requestAuthorization() {
    return { ok: false, error: 'HealthKit is only available on iOS.' };
  },

  async getStepCountToday() {
    return { ok: false, error: 'HealthKit is only available on iOS.' };
  },
};
