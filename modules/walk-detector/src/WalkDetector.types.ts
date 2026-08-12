/** A single detected walk. Shape is shared by the native and web implementations. */
export type WalkEvent = {
  id: string;
  startedAtMs: number;
  endedAtMs: number | null;
  steps: number;
  /** `stub` comes only from emitTestEvent; real detection emits `live` / `retrospective`. */
  source: 'stub' | 'live' | 'retrospective';
  /**
   * Optional: absent on web, on stub events, and on retrospective rows.
   * ⚠️ These cross the Swift `[String: Any]` boundary, which no gate verifies —
   * tsc still passes if the native payload drops them. /debug on a device is
   * the only check.
   */
  distanceMeters?: number | null;
  /** CoreMotion activity confidence: 'low' | 'medium' | 'high' | '?' | '-'. */
  confidence?: string;
};

/**
 * Values only the native side can know. Used to prove the JS <-> Swift bridge is
 * actually live — a JS mock cannot fake `isPedometerAvailable` on a real device.
 */
export type WalkDetectorDiagnostics = {
  isPedometerAvailable: boolean;
  isActivityAvailable: boolean;
  /** 'granted' | 'denied' | 'prompt' | 'unknown' | 'unavailable' */
  motionAuthorization: string;
  systemVersion: string;
  isSimulator: boolean;
  isRunning: boolean;
  /**
   * Required (not optional) on purpose: both web implementations must construct
   * the full object, so tsc is what forces them to stay in sync with this type.
   * 'core-location-keepalive' | 'healthkit-observer' | 'none'
   */
  mechanism: string;
  /** 'always' | 'whenInUse' | 'denied' | 'notDetermined' | 'unknown' | 'unavailable' */
  locationAuthorization: string;
  /** Dev-facing preflight warnings from the native core (Korean). Empty = healthy. */
  warnings: string[];
};

export type WalkDetectorModuleEvents = {
  onWalkDetected: (event: WalkEvent) => void;
};
