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

export type WalkEvent = {
  id: string;
  startedAtMs: number;
  endedAtMs: number | null;
  steps: number;
  source: 'stub' | 'live' | 'retrospective';
};

export type WalkDetectorDiagnostics = {
  isPedometerAvailable: boolean;
  isActivityAvailable: boolean;
  motionAuthorization: string;
  systemVersion: string;
  isSimulator: boolean;
  isRunning: boolean;
};

export interface WalkDetectorPort {
  readonly isAvailable: boolean;
  start(): Promise<AdapterResult<boolean>>;
  stop(): Promise<AdapterResult<boolean>>;
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

export interface NotificationsPort {
  readonly isAvailable: boolean;
  getPermission(): Promise<AdapterResult<PermissionState>>;
  requestPermission(): Promise<AdapterResult<PermissionState>>;
}

export type LocationPermission = {
  foreground: PermissionState;
  background: PermissionState;
};

export interface LocationPort {
  readonly isAvailable: boolean;
  getPermission(): Promise<AdapterResult<LocationPermission>>;
  /** Stage 1. iOS cannot grant Always directly — When In Use must come first. */
  requestForegroundPermission(): Promise<AdapterResult<LocationPermission>>;
  /** Stage 2. Only meaningful once foreground access is granted. */
  requestBackgroundPermission(): Promise<AdapterResult<LocationPermission>>;
}

export type WalkRecord = {
  id: string;
  startedAtMs: number;
  endedAtMs: number | null;
  steps: number;
  note: string | null;
};

export interface StoragePort {
  /** True when backed by real persistence (SQLite). False for the web mock. */
  readonly isPersistent: boolean;
  init(): Promise<AdapterResult<true>>;
  listWalks(): Promise<AdapterResult<WalkRecord[]>>;
  insertWalk(record: WalkRecord): Promise<AdapterResult<true>>;
  clear(): Promise<AdapterResult<true>>;
}

/** Normalizes an unknown throwable into the AdapterResult error branch. */
export function toError(error: unknown): { ok: false; error: string } {
  if (error instanceof Error) return { ok: false, error: `${error.name}: ${error.message}` };
  return { ok: false, error: String(error) };
}
