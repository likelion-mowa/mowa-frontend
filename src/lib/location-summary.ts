import type { GeocodedAddress } from '@/adapters';
import { LIMITS } from '@/api/types';

/**
 * Turning a reverse-geocode result into the one string the record shows.
 *
 * `import type` only — this file stays platform-free and pure so it is safe in
 * the web bundle and readable without a device.
 */

/**
 * Fields tried in order, coarsening as it goes.
 *
 * Measured on device 2026-08-15 (경기 광주): `district` held the 행정동
 * ("양벌동"), which is exactly the level the prototype's card asks for, so it
 * leads. `subregion` (시/군/구) and `city` follow — both are still true and
 * still useful to the AI prompt when `district` comes back null, which is the
 * only reason to keep them rather than show nothing.
 *
 * `street` is deliberately NOT here even though the same measurement had it
 * holding "양벌동" too. Apple returns a road name there wherever roads are
 * named, and nothing in the payload distinguishes a road from a 동 — so
 * including it would sometimes label a walk with a street and we would have no
 * way to notice.
 */
const FIELD_ORDER = ['district', 'subregion', 'city'] as const satisfies readonly (keyof GeocodedAddress)[];

/**
 * The first usable place name, or null when the result carries none.
 *
 * Null is a normal outcome and needs no special handling upstream: every screen
 * that shows a location already hides it when it is null, and the server
 * documents `locationSummary` as optional.
 */
export function pickLocationSummary(addresses: GeocodedAddress[]): string | null {
  // Only the first result. Later entries are alternative interpretations of the
  // same coordinate, so mixing fields across them could pair a 동 from one with
  // a 구 from another.
  const address = addresses[0];
  if (address === undefined) return null;

  for (const field of FIELD_ORDER) {
    const value = address[field]?.trim() ?? '';
    // The server rejects a blank value, and a whitespace-only field is exactly
    // what a geocoder returns for "this level does not apply here".
    if (value.length > 0) return value.slice(0, LIMITS.locationSummaryMaxLength);
  }
  return null;
}
