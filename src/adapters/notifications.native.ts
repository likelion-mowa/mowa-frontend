import * as Notifications from 'expo-notifications';

import { toError, type NotificationsPort, type PermissionState } from './types';

/**
 * Local notifications only. This app never registers for remote push:
 * `aps-environment` cannot be signed by a free Apple Personal Team, and
 * scripts/strip-aps-entitlement.mjs removes the entitlement that the
 * expo-notifications config plugin injects.
 */
function toPermissionState(status: Notifications.PermissionStatus): PermissionState {
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

export const notifications: NotificationsPort = {
  isAvailable: true,

  async getPermission() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return { ok: true, value: toPermissionState(status) };
    } catch (error) {
      return toError(error);
    }
  },

  async requestPermission() {
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      return { ok: true, value: toPermissionState(status) };
    } catch (error) {
      return toError(error);
    }
  },
};
