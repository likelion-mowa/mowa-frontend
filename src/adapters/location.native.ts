import * as Location from 'expo-location';

import {
  toError,
  type LocationPermission,
  type LocationPort,
  type PermissionState,
} from './types';

/**
 * IOS LOCATION IS A TWO-STAGE GRANT.
 *
 * `requestBackgroundPermissionsAsync` (Always) cannot be the first prompt. iOS
 * requires When In Use first; only then can the app ask for the upgrade, which
 * the system may also defer and present on its own schedule.
 *
 * Requesting them together looks like "the Always dialog never appears", which
 * is why the smoke screen exposes the two stages as separate buttons.
 */
function toPermissionState(status: Location.PermissionStatus): PermissionState {
  switch (status) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'undetermined':
      return 'prompt';
    default:
      return 'unknown';
  }
}

async function readPermission(): Promise<LocationPermission> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return {
    foreground: toPermissionState(foreground.status),
    background: toPermissionState(background.status),
  };
}

export const location: LocationPort = {
  isAvailable: true,

  async getPermission() {
    try {
      return { ok: true, value: await readPermission() };
    } catch (error) {
      return toError(error);
    }
  },

  async requestForegroundPermission() {
    try {
      await Location.requestForegroundPermissionsAsync();
      return { ok: true, value: await readPermission() };
    } catch (error) {
      return toError(error);
    }
  },

  async requestBackgroundPermission() {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      if (foreground.status !== 'granted') {
        return {
          ok: false,
          error: 'Grant "When In Use" first — iOS will not show the Always prompt before that.',
        };
      }
      await Location.requestBackgroundPermissionsAsync();
      return { ok: true, value: await readPermission() };
    } catch (error) {
      return toError(error);
    }
  },
};
