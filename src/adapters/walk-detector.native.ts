import WalkDetector from '../../modules/walk-detector';

import { toError, type WalkDetectorPort, type WalkEvent } from './types';

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

  async queryHistory(sinceMs) {
    try {
      return { ok: true, value: await WalkDetector.queryHistory(sinceMs) };
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
