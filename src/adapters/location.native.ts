import * as Location from 'expo-location';

import {
  toError,
  type GeocodedAddress,
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

/**
 * Copied field by field rather than spread, so the expo type never leaks past
 * this file and a field disappearing upstream fails to compile here instead of
 * turning into a silent `undefined` on a /debug row.
 */
function toGeocodedAddress(address: Location.LocationGeocodedAddress): GeocodedAddress {
  return {
    city: address.city,
    district: address.district,
    streetNumber: address.streetNumber,
    street: address.street,
    region: address.region,
    subregion: address.subregion,
    country: address.country,
    postalCode: address.postalCode,
    name: address.name,
    isoCountryCode: address.isoCountryCode,
    timezone: address.timezone,
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

  async getCurrentPlace() {
    const startedAt = Date.now();
    try {
      // Balanced (~100m) is the accuracy expo already defaults to, and it is
      // the right tier for a neighbourhood name: a finer fix costs time and
      // battery to resolve the same 동. This is a foreground read on demand and
      // is unrelated to the detector's keepalive, which AGENTS.md forbids
      // lowering.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const addresses = await Location.reverseGeocodeAsync(position.coords);
      return {
        ok: true,
        value: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          fixAgeMs: Date.now() - position.timestamp,
          elapsedMs: Date.now() - startedAt,
          // An empty list is reported as success on purpose — see PlaceReading.
          addresses: addresses.map(toGeocodedAddress),
        },
      };
    } catch (error) {
      return toError(error);
    }
  },
};
