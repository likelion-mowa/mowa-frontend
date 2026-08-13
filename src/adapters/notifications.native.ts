import * as Notifications from 'expo-notifications';

import {
  toError,
  type NotificationsPort,
  type NotificationTapData,
  type PermissionState,
} from './types';

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

/**
 * For a local notification iOS hands the whole `userInfo` through as `data`, so
 * these are the keys WalkDetectorCore.postNotification writes. Typed as unknown
 * on the way in — nothing verifies the native payload at compile time.
 */
function toTapData(response: Notifications.NotificationResponse): NotificationTapData {
  const data: Record<string, unknown> = response.notification.request.content.data ?? {};
  return {
    path: typeof data.path === 'string' ? data.path : null,
    issuedAtMs: typeof data.issuedAtMs === 'number' ? data.issuedAtMs : null,
  };
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

  setForegroundHandler() {
    Notifications.setNotificationHandler({
      // All four keys are required by NotificationBehavior in SDK 57;
      // `shouldShowAlert` is the deprecated predecessor of banner + list.
      // Sound and badge stay off: the Core already attaches a sound to the
      // notification itself, and this app has no badge count to speak of.
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  },

  async getInitialResponse() {
    try {
      // The synchronous getter; `getLastNotificationResponseAsync` is
      // deprecated in expo-notifications 57.
      const response = Notifications.getLastNotificationResponse();
      return { ok: true, value: response ? toTapData(response) : null };
    } catch (error) {
      return toError(error);
    }
  },

  addResponseListener(listener) {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      listener(toTapData(response));
    });
    return () => subscription.remove();
  },
};
