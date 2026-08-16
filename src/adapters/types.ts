/**
 * Port interfaces for every native capability.
 *
 * This file is platform-free: it imports nothing and is safe on every target.
 * Both halves of each adapter pair (`x.ts` = web, `x.native.ts` = iOS) annotate
 * their export with the port type from here, which is what keeps the two
 * implementations from drifting apart.
 */

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable' | 'unknown';

/** Result wrapper. Adapters never throw for "not supported" — they report it. */
export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Re-exported from the native module rather than re-declared.
 *
 * These used to be declared twice — once here and once in the module — which
 * meant the two could disagree outright. Now there is one definition.
 *
 * `import type` is erased at compile time, so this creates no runtime edge into
 * `modules/` and cannot pull the native module into the web bundle. It also
 * bypasses `modules/walk-detector/index.ts`, which re-exports the native default.
 *
 * ⚠️ This does NOT make `tsc` catch drift. Measured: adding a field to WalkEvent
 * still leaves `tsc --noEmit` at exit 0, because no TypeScript code ever
 * constructs a complete WalkEvent — Swift does, across a `[String: Any]`
 * boundary with zero compile-time checking. Renaming a field IS caught, since
 * call sites read it.
 *
 * Practical rule when porting the real detector: changing the Swift payload
 * shape is unverified by every gate in this repo. Check it on device.
 */
import type {
  WalkEvent,
  WalkDetectorDiagnostics,
  WalkMechanism,
} from '../../modules/walk-detector/src/WalkDetector.types';

export type { WalkEvent, WalkDetectorDiagnostics, WalkMechanism };

export interface WalkDetectorPort {
  readonly isAvailable: boolean;
  /**
   * Omitting `mechanism` starts the native default: 'layered', keepalive +
   * observer safety net (verified 2026-08-13 — one notification per walk;
   * observer lags walk-end by ~7–18 min, so it backstops rather than
   * replaces). Single mechanisms exist for /debug measurement.
   */
  start(mechanism?: WalkMechanism): Promise<AdapterResult<boolean>>;
  stop(): Promise<AdapterResult<boolean>>;
  /**
   * Withholds the walk notification while leaving detection running (설정 >
   * 기록 제안 알림). The Core posts the notification itself, so this is the
   * only honest way to expose that switch — a JS-side flag could not suppress
   * anything.
   */
  setNotificationsEnabled(enabled: boolean): Promise<AdapterResult<boolean>>;
  /**
   * The step bar a walk must pass to qualify (기본 30, 사용자 설정 10~100).
   * The Core reads this live from UserDefaults on every pedometer callback, so
   * it applies immediately — no restart needed. Shared with the HealthKit
   * safety net's 2-hour delta check, so lowering it also raises that net's
   * false-positive rate; that is accepted, not a bug.
   */
  setThresholdSteps(steps: number): Promise<AdapterResult<boolean>>;
  /** Minimum gap between two walk notifications (기본 300초). Applies to the next check, no restart. */
  setCooldownSeconds(seconds: number): Promise<AdapterResult<boolean>>;
  /** How long to stay still before a walk counts as over (기본 180초). Applies to debounces scheduled after the call. */
  setEndDebounceSeconds(seconds: number): Promise<AdapterResult<boolean>>;
  queryHistory(sinceMs: number): Promise<AdapterResult<WalkEvent[]>>;
  getDiagnostics(): Promise<AdapterResult<WalkDetectorDiagnostics>>;
  emitTestEvent(): Promise<AdapterResult<boolean>>;
  subscribe(listener: (event: WalkEvent) => void): () => void;
}

export type HealthStatus = {
  isHealthDataAvailable: boolean;
  authorization: PermissionState;
};

export interface HealthPort {
  readonly isAvailable: boolean;
  /** Reads HKHealthStore.isHealthDataAvailable() without prompting. */
  getStatus(): Promise<AdapterResult<HealthStatus>>;
  /**
   * Requests read access to step count. The iOS sheet is shown ONCE per
   * install — a denial afterwards can only be undone in Settings.
   */
  requestAuthorization(): Promise<AdapterResult<HealthStatus>>;
  getStepCountToday(): Promise<AdapterResult<number>>;
}

/**
 * What a tap on the walk notification carries, from the `userInfo` the Core
 * attaches in `postNotification` (path + issuedAtMs).
 *
 * Both fields are nullable because the payload crosses the native boundary
 * untyped: a notification posted by an older build, or anything else that ever
 * reaches this app, may carry neither.
 */
export type NotificationTapData = {
  path: string | null;
  issuedAtMs: number | null;
};

export interface NotificationsPort {
  readonly isAvailable: boolean;
  getPermission(): Promise<AdapterResult<PermissionState>>;
  requestPermission(): Promise<AdapterResult<PermissionState>>;
  /**
   * Presents notifications that arrive while the app is in the foreground.
   * Without it iOS delivers them silently to the app and shows nothing.
   * Idempotent — the handler is global, so calling twice just replaces it.
   */
  setForegroundHandler(): void;
  /**
   * The tap that launched the app, if any. A response listener alone MISSES
   * cold-start taps (measured in the prior repo), so this must run at mount.
   *
   * Consuming: iOS remembers the last response indefinitely, so this clears it
   * after reading. Otherwise every later launch replays a tap the user already
   * acted on and the app jumps to the walk screen unbidden.
   */
  getInitialResponse(): Promise<AdapterResult<NotificationTapData | null>>;
  /** Taps received while the app is already running. Returns the unsubscribe. */
  addResponseListener(listener: (data: NotificationTapData) => void): () => void;
}

export type LocationPermission = {
  foreground: PermissionState;
  background: PermissionState;
};

/**
 * One reverse-geocoded address.
 *
 * Mirrors expo-location's `LocationGeocodedAddress` rather than importing it,
 * because this file must stay platform-free. Android-only fields are omitted:
 * `platforms` in app.json is ios and web.
 *
 * Every field is nullable and none is documented as carrying a specific
 * administrative level, so which one holds a Korean 행정동 ("망원동") is a
 * device measurement, not a documented fact — see `/debug`.
 */
export type GeocodedAddress = {
  city: string | null;
  district: string | null;
  streetNumber: string | null;
  street: string | null;
  region: string | null;
  subregion: string | null;
  country: string | null;
  postalCode: string | null;
  name: string | null;
  isoCountryCode: string | null;
  timezone: string | null;
};

/** A position fix plus whatever reverse geocoding made of it. */
export type PlaceReading = {
  latitude: number;
  longitude: number;
  /** Age of the fix when it was read. A stale fix labels the wrong place. */
  fixAgeMs: number;
  /** Wall-clock cost of the whole read, to judge whether it can run inline. */
  elapsedMs: number;
  /**
   * Empty is a normal outcome, NOT an error: reverse geocoding needs the
   * network and Apple rate-limits it. Callers decide what an empty list means.
   */
  addresses: GeocodedAddress[];
};

export interface LocationPort {
  readonly isAvailable: boolean;
  getPermission(): Promise<AdapterResult<LocationPermission>>;
  /** Stage 1. iOS cannot grant Always directly — When In Use must come first. */
  requestForegroundPermission(): Promise<AdapterResult<LocationPermission>>;
  /** Stage 2. Only meaningful once foreground access is granted. */
  requestBackgroundPermission(): Promise<AdapterResult<LocationPermission>>;
  /**
   * Reads the current fix and reverse-geocodes it. iOS only.
   *
   * Returns the raw address list rather than a chosen summary string on
   * purpose: which field carries the neighbourhood name is exactly what /debug
   * is measuring, and an adapter that picked one would leave nothing to measure.
   */
  getCurrentPlace(): Promise<AdapterResult<PlaceReading>>;
}

/**
 * A walk the device detected, buffered locally until the server has a
 * `walk_candidates` row for it.
 *
 * This is deliberately NOT a mirror of any backend table. The spec assigns
 * start/end judgement to the client (docs/backend/api-spec.md 기능 1), so a
 * detection exists on the device before it exists on the server — this is the
 * shape that gap needs. The diary itself (title, body, emotions, tags) is never
 * stored here: it lives in `experience_drafts` / `walk_experiences` and is
 * typed in `src/api/types.ts`.
 *
 * `note` used to be here. The 8/10 design change deleted it from both backend
 * tables — see docs/backend/design-changes-2026-08-10.md §6. Do not reintroduce it.
 */
export type DetectedWalk = {
  /** Generated on-device. NOT the server's `candidateId`. */
  id: string;
  startedAtMs: number;
  endedAtMs: number | null;
  /**
   * Client-only. The backend has no steps column anywhere — steps are a
   * detection signal, not part of the record the user ends up reading.
   */
  steps: number;
  /** Sent as `locationSummary` on candidate creation. Max 255 chars server-side. */
  locationSummary: string | null;
  /**
   * The `candidateId` returned by `POST /walk-candidates`, or null while this
   * detection has not reached the server yet.
   */
  candidateId: string | null;
};

/**
 * A photo the user picked or captured for the diary flow.
 *
 * `uri` is for local preview only: an app-sandbox `file://` URI on iOS, an
 * object URL on web. The upload path must keep the original `File` on web and
 * native filename/MIME hints where available, then send only the Cloudinary
 * HTTPS `secure_url` to the backend.
 */
export type PickedPhoto = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File;
};

export interface PhotoPickerPort {
  readonly isAvailable: boolean;
  /** Resolves `null` when the user cancelled the picker — that is not an error. */
  pickFromLibrary(): Promise<AdapterResult<PickedPhoto | null>>;
  captureWithCamera(): Promise<AdapterResult<PickedPhoto | null>>;
  /**
   * Reads the camera permission WITHOUT prompting, for the permissions screen.
   *
   * There is no library equivalent on purpose: the library path runs through
   * PHPickerViewController out of process, so this app holds no photo-library
   * permission at all and a row claiming otherwise would be fiction.
   */
  getCameraPermission(): Promise<AdapterResult<PermissionState>>;
}

export interface StoragePort {
  /** True when backed by real persistence (SQLite). False for the web mock. */
  readonly isPersistent: boolean;
  init(): Promise<AdapterResult<true>>;
  listWalks(): Promise<AdapterResult<DetectedWalk[]>>;
  insertWalk(record: DetectedWalk): Promise<AdapterResult<true>>;
  clear(): Promise<AdapterResult<true>>;
}

/**
 * Small key-value store that survives a relaunch, backed by the OS keychain on
 * iOS and localStorage on web.
 *
 * Separate from StoragePort on purpose: that one is a walk-record repository
 * (`DetectedWalk` rows), not a KV store, and widening it would mean a new
 * SQLite table plus a `PRAGMA user_version` bump on every installed device.
 *
 * It also carries two values that are NOT secrets — the detection and
 * notification preferences. A second mechanism just for them would cost another
 * dependency (no AsyncStorage here) to save two keychain entries, which is the
 * worse trade.
 */
export interface SecureStorePort {
  /** True when backed by the OS keychain. False for the web fallback. */
  readonly isSecure: boolean;
  /** Resolves `null` when the key was never written — that is not an error. */
  getItem(key: string): Promise<AdapterResult<string | null>>;
  setItem(key: string, value: string): Promise<AdapterResult<true>>;
  deleteItem(key: string): Promise<AdapterResult<true>>;
}

/**
 * Keys owned by SecureStorePort. Versioned like `mowa.walks.v2` so a shape
 * change abandons the old value instead of misreading it.
 */
export const SECURE_KEYS = {
  authToken: 'mowa.auth.token.v1',
  detectionEnabled: 'mowa.detection.enabled.v1',
  notificationsEnabled: 'mowa.notification.enabled.v1',
} as const;

/** Opens the OS settings app for this app. iOS only. */
export interface SystemSettingsPort {
  readonly isAvailable: boolean;
  open(): Promise<AdapterResult<true>>;
}

/** Normalizes an unknown throwable into the AdapterResult error branch. */
export function toError(error: unknown): { ok: false; error: string } {
  if (error instanceof Error) return { ok: false, error: `${error.name}: ${error.message}` };
  return { ok: false, error: String(error) };
}
