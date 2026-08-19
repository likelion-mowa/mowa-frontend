/** A single detected walk. Shape is shared by the native and web implementations. */
export type WalkEvent = {
  id: string;
  startedAtMs: number;
  /**
   * Set on every real detection: a live event fires once the walk is over
   * (the Core debounces the stationary period), and retrospective rows carry
   * the segment's end. Null only on stub events from emitTestEvent.
   */
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
 * Mechanism selectable from JS when starting detection. Mirrors Swift
 * `WalkDetectorCore.Mechanism` minus `none` (that value is the Core's internal
 * "disabled" state, not something JS may request).
 * 'layered' = keepalive as the live detector + observer as a missed-walk safety
 * net, with double-notification arbitration in the Core.
 * ⚠️ The string values cross the bridge unchecked — tsc cannot catch drift
 * against the Swift enum's raw values.
 */
export type WalkMechanism = 'core-location-keepalive' | 'healthkit-observer' | 'layered';

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
   * 'core-location-keepalive' | 'healthkit-observer' | 'layered' | 'none'
   */
  mechanism: string;
  /** 'always' | 'whenInUse' | 'denied' | 'notDetermined' | 'unknown' | 'unavailable' */
  locationAuthorization: string;
  /** Dev-facing preflight warnings from the native core (Korean). Empty = healthy. */
  warnings: string[];
  /**
   * 설정 > 기록 제안 알림. Lives in UserDefaults, so this is the read-back —
   * never assume the JS copy and this agree after a reinstall (the Keychain
   * outlives app deletion; UserDefaults does not).
   *
   * Required, not optional: that is what forces both web stubs to construct it
   * and keeps tsc as the check on the two implementations staying in sync.
   */
  notificationsEnabled: boolean;

  /**
   * Walk-session state. A detector that stays quiet is doing one of a few
   * distinguishable things, and these are what tell them apart:
   * no walking classification, a dead sensor subscription, a walk under the
   * step bar, or an end still inside the stationary debounce.
   */
  /** Last CoreMotion classification, e.g. 'walking+stationary' or 'unknown'. */
  activity: string;
  /** Its confidence: 'low' | 'medium' | 'high' | '?' | '-'. Low is rejected. */
  confidence: string;
  /** Pedometer total since detection started (not per walk). */
  currentSteps: number;
  walkActive: boolean;
  walkStartedAtMs: number | null;
  /** Steps in the current walk. Compared against the 30-step bar. */
  walkSteps: number;
  /** True once this walk passed the bar; the end is what notifies. */
  walkQualified: boolean;
  /** Set while an end is being debounced — the real moment the user stopped. */
  stationarySinceMs: number | null;

  /**
   * The three detection criteria, all sourced from the Core's UserDefaults-backed
   * getters so 자동 감지 설정 shows what is actually in effect. They are NOT
   * mirrored as TypeScript constants on purpose: a mirror is a second source of
   * truth, and no gate in this repo compares it against the Swift literals at
   * WalkDetectorModule.swift:63-65.
   */
  endDebounceSeconds: number;
  /** The step bar a walk must pass to qualify. */
  thresholdSteps: number;
  /** Minimum gap between two walk notifications, shared by both mechanisms. */
  cooldownSeconds: number;

  /**
   * When the HealthKit observer safety net last fired. Null = never on this
   * install (the Core stores 0 for an unwritten key). Its only consumer is
   * /debug: it is how an observer fire is confirmed without pulling os_log off
   * the device.
   */
  lastObserverFiredAtMs: number | null;
  /**
   * The safety net's dedupe watermark: steps with HealthKit sample dates at or
   * before this are already handled (live-confirmed walk, or announced by the
   * observer itself), so the observer never notifies for them again. Null =
   * never written on this install. Advancing to a walk's end time after each
   * detection is what proves the double-notification fix on a device.
   */
  stepsAccountedUntilMs: number | null;
  /** Sensor liveness. A stale value with detection running means a dead subscription. */
  lastActivityAtMs: number | null;
  lastPedometerAtMs: number | null;
};

export type WalkDetectorModuleEvents = {
  onWalkDetected: (event: WalkEvent) => void;
};
