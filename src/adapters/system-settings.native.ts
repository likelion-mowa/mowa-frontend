import * as Linking from 'expo-linking';

import { toError, type SystemSettingsPort } from './types';

/**
 * iOS implementation. `openSettings()` lands on this app's own settings pane,
 * which is the only place a revoked permission can be restored — iOS shows
 * each prompt once per install.
 */
export const systemSettings: SystemSettingsPort = {
  isAvailable: true,

  async open() {
    try {
      await Linking.openSettings();
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },
};
