import type { WalkDetectorPort } from './types';

/**
 * WEB implementation — and the file `tsc` resolves for the whole codebase.
 *
 * Metro resolves `walk-detector.web.ts` -> `walk-detector.ts` on web and
 * `walk-detector.native.ts` on iOS; it never considers `.native.ts` for web.
 * `tsc` has no concept of platform extensions and only ever resolves this base
 * file, which is why it must be a real module rather than a declaration stub.
 *
 * Keeping the native import exclusively inside `.native.ts` is also what
 * guarantees `modules/walk-detector` never enters the web bundle graph.
 */
export const walkDetector: WalkDetectorPort = {
  isAvailable: false,

  async start() {
    return { ok: false, error: 'Walk detection requires CoreMotion and is iOS-only.' };
  },

  async stop() {
    return { ok: false, error: 'Walk detection requires CoreMotion and is iOS-only.' };
  },

  async setNotificationsEnabled() {
    return { ok: false, error: 'Walk notifications are posted natively and are iOS-only.' };
  },

  async setThresholdSteps() {
    return { ok: false, error: 'Walk detection requires CoreMotion and is iOS-only.' };
  },

  async setCooldownSeconds() {
    return { ok: false, error: 'Walk detection requires CoreMotion and is iOS-only.' };
  },

  async setEndDebounceSeconds() {
    return { ok: false, error: 'Walk detection requires CoreMotion and is iOS-only.' };
  },

  async queryHistory() {
    return { ok: true, value: [] };
  },

  async requestMotionPermission() {
    // Not an error: the browser has no motion-activity permission to ask for,
    // and the caller renders '해당 없음' from this rather than a failure.
    return { ok: true, value: 'unavailable' };
  },

  async getDiagnostics() {
    return {
      ok: true,
      value: {
        isPedometerAvailable: false,
        isActivityAvailable: false,
        motionAuthorization: 'unavailable',
        systemVersion: 'web',
        isSimulator: false,
        isRunning: false,
        mechanism: 'none',
        locationAuthorization: 'unavailable',
        warnings: [],
        notificationsEnabled: false,
        activity: '-',
        confidence: '-',
        currentSteps: 0,
        walkActive: false,
        walkStartedAtMs: null,
        walkSteps: 0,
        walkQualified: false,
        stationarySinceMs: null,
        endDebounceSeconds: 0,
        thresholdSteps: 0,
        cooldownSeconds: 0,
        lastObserverFiredAtMs: null,
        stepsAccountedUntilMs: null,
        lastActivityAtMs: null,
        lastPedometerAtMs: null,
      },
    };
  },

  async emitTestEvent() {
    return { ok: false, error: 'No native event source on web.' };
  },

  subscribe() {
    return () => {};
  },
};
