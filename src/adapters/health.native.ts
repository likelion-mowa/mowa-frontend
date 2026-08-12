import {
  authorizationStatusFor,
  isHealthDataAvailable,
  queryStatisticsForQuantity,
  requestAuthorization,
  AuthorizationStatus,
} from '@kingstinct/react-native-healthkit';

import {
  toError,
  type HealthPort,
  type HealthStatus,
  type PermissionState,
} from './types';

const STEP_COUNT = 'HKQuantityTypeIdentifierStepCount' as const;

/**
 * NOTE ON HEALTHKIT PERMISSION STATE
 *
 * `authorizationStatusFor` reports SHARING (write) status only. Apple
 * deliberately never discloses read authorization, so a read-only type reports
 * `notDetermined` even after the user has granted access. This means a denied
 * permission and an empty data set are indistinguishable from the API.
 *
 * Practical consequence: never infer "permission denied" from an empty result.
 * The prior investigation in ios-movement-test misdiagnosed exactly this.
 */
function toPermissionState(status: AuthorizationStatus): PermissionState {
  switch (status) {
    case AuthorizationStatus.sharingAuthorized:
      return 'granted';
    case AuthorizationStatus.sharingDenied:
      return 'denied';
    case AuthorizationStatus.notDetermined:
      return 'prompt';
    default:
      return 'unknown';
  }
}

async function readStatus(): Promise<HealthStatus> {
  const available = isHealthDataAvailable();
  return {
    isHealthDataAvailable: available,
    authorization: available ? toPermissionState(authorizationStatusFor(STEP_COUNT)) : 'unavailable',
  };
}

export const health: HealthPort = {
  isAvailable: true,

  async getStatus() {
    try {
      return { ok: true, value: await readStatus() };
    } catch (error) {
      return toError(error);
    }
  },

  async requestAuthorization() {
    try {
      if (!isHealthDataAvailable()) {
        return { ok: false, error: 'HKHealthStore.isHealthDataAvailable() returned false.' };
      }
      // Read-only. `toShare: []` still requires NSHealthUpdateUsageDescription
      // in Info.plist — iOS crashes the app on launch without it.
      // The iOS permission sheet appears ONCE per install; a denial afterwards
      // can only be reversed in Settings > Privacy > Health.
      await requestAuthorization({ toShare: [], toRead: [STEP_COUNT] });
      return { ok: true, value: await readStatus() };
    } catch (error) {
      return toError(error);
    }
  },

  async getStepCountToday() {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const result = await queryStatisticsForQuantity(STEP_COUNT, ['cumulativeSum'], {
        filter: { date: { startDate: startOfDay, endDate: new Date() } },
      });

      return { ok: true, value: result.sumQuantity?.quantity ?? 0 };
    } catch (error) {
      return toError(error);
    }
  },
};
