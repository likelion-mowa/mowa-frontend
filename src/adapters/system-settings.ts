import type { SystemSettingsPort } from './types';

/**
 * WEB implementation, and the file `tsc` resolves.
 *
 * A browser cannot open the OS settings app, and `expo-linking`'s
 * `openSettings()` throws `UnavailabilityError` there. Screens are not allowed
 * to call native APIs directly (AGENTS.md), so the honest "no" lives here and
 * the permissions screen just hides the button when `isAvailable` is false.
 */
export const systemSettings: SystemSettingsPort = {
  isAvailable: false,

  async open() {
    return { ok: false, error: 'Opening the OS settings app is only available on iOS.' };
  },
};
