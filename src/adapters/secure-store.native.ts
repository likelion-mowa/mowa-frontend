import * as SecureStore from 'expo-secure-store';

import { toError, type SecureStorePort } from './types';

/**
 * iOS implementation. Keychain-backed, so the value survives a relaunch and is
 * not readable by other apps.
 *
 * AFTER_FIRST_UNLOCK rather than the WHEN_UNLOCKED default: iOS relaunches this
 * app in the background on a significant location change, and that can happen
 * while the phone is locked. With WHEN_UNLOCKED the token read would fail there
 * and the walk would be buffered locally with no server candidate — a silent
 * degradation, which is the failure class this repo spends the most effort
 * avoiding.
 *
 * Keychain entries outlive app deletion on iOS. A reinstall therefore restores
 * the token while UserDefaults (the native detector's own state) is wiped, so
 * callers must reconcile the two rather than trust either alone.
 */
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export const secureStore: SecureStorePort = {
  isSecure: true,

  async getItem(key) {
    try {
      return { ok: true, value: await SecureStore.getItemAsync(key, options) };
    } catch (error) {
      return toError(error);
    }
  },

  async setItem(key, value) {
    try {
      await SecureStore.setItemAsync(key, value, options);
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },

  async deleteItem(key) {
    try {
      await SecureStore.deleteItemAsync(key, options);
      return { ok: true, value: true };
    } catch (error) {
      return toError(error);
    }
  },
};
