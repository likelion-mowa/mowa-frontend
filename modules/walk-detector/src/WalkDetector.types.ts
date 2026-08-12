/** A single detected walk. Shape is shared by the native and web implementations. */
export type WalkEvent = {
  id: string;
  startedAtMs: number;
  endedAtMs: number | null;
  steps: number;
  /** `stub` until F1 detection lands. */
  source: 'stub' | 'live' | 'retrospective';
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
};

export type WalkDetectorModuleEvents = {
  onWalkDetected: (event: WalkEvent) => void;
};
