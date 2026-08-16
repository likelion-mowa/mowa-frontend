import WalkDetector from '../../modules/walk-detector';

import { toError, toPermissionState, type WalkDetectorPort, type WalkEvent } from './types';

/**
 * iOS implementation.
 *
 * This is the ONLY file outside `modules/` that references the native module,
 * and it is a `.native.ts`, so the import is unreachable from the web bundle.
 */
export const walkDetector: WalkDetectorPort = {
  isAvailable: true,

  async start(mechanism) {
    try {
      // `?? null` keeps the Swift call at a fixed arity of one argument instead
      // of leaning on optional-argument marshalling that no gate verifies.
      return { ok: true, value: await WalkDetector.start(mechanism ?? null) };
    } catch (error) {
      return toError(error);
    }
  },

  async stop() {
    try {
      return { ok: true, value: await WalkDetector.stop() };
    } catch (error) {
      return toError(error);
    }
  },

  async setNotificationsEnabled(enabled) {
    try {
      return { ok: true, value: await WalkDetector.setNotificationsEnabled(enabled) };
    } catch (error) {
      return toError(error);
    }
  },

  async setThresholdSteps(steps) {
    try {
      return { ok: true, value: await WalkDetector.setThresholdSteps(steps) };
    } catch (error) {
      return toError(error);
    }
  },

  async setCooldownSeconds(seconds) {
    try {
      return { ok: true, value: await WalkDetector.setCooldownSeconds(seconds) };
    } catch (error) {
      return toError(error);
    }
  },

  async setEndDebounceSeconds(seconds) {
    try {
      return { ok: true, value: await WalkDetector.setEndDebounceSeconds(seconds) };
    } catch (error) {
      return toError(error);
    }
  },

  async queryHistory(sinceMs) {
    try {
      return { ok: true, value: await WalkDetector.queryHistory(sinceMs) };
    } catch (error) {
      return toError(error);
    }
  },

  async requestMotionPermission() {
    try {
      // CoreMotion has no request API. `queryHistory` reaches
      // `CMMotionActivityManager.queryActivityStarting`, and issuing that query
      // IS what makes iOS show the Motion & Fitness dialog — the callback does
      // not fire until the user has answered. A one-minute window is the
      // cheapest query that still counts: the rows are thrown away, only the
      // prompt matters.
      await WalkDetector.queryHistory(Date.now() - 60_000);
      // Read back rather than infer. An empty result cannot be told apart from
      // a denial, and the Core exposes the real authorization status.
      const diagnostics = await WalkDetector.getDiagnostics();
      return { ok: true, value: toPermissionState(diagnostics.motionAuthorization) };
    } catch (error) {
      return toError(error);
    }
  },

  async getDiagnostics() {
    try {
      return { ok: true, value: await WalkDetector.getDiagnostics() };
    } catch (error) {
      return toError(error);
    }
  },

  async emitTestEvent() {
    try {
      return { ok: true, value: await WalkDetector.emitTestEvent() };
    } catch (error) {
      return toError(error);
    }
  },

  subscribe(listener: (event: WalkEvent) => void) {
    const subscription = WalkDetector.addListener('onWalkDetected', listener);
    return () => subscription.remove();
  },
};
