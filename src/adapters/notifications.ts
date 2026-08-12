import type { NotificationsPort } from './types';

/**
 * WEB implementation, and the file `tsc` resolves.
 *
 * `expo-notifications` declares `platforms: ['android', 'ios']`. Importing it on
 * web does not crash the bundle, but every call throws `UnavailabilityError`,
 * so the web branch must not call it at all.
 */
export const notifications: NotificationsPort = {
  isAvailable: false,

  async getPermission() {
    return { ok: true, value: 'unavailable' as const };
  },

  async requestPermission() {
    return { ok: false, error: 'Notifications are not supported on web in this app.' };
  },
};
