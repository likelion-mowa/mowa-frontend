import { registerWebModule, NativeModule } from 'expo';

import type {
  WalkDetectorDiagnostics,
  WalkDetectorModuleEvents,
  WalkEvent,
} from './WalkDetector.types';

/**
 * Web fallback. Walk detection needs CoreMotion, which has no browser
 * equivalent, so every method resolves to a neutral value instead of throwing.
 *
 * In practice this file is never reached: `src/adapters/walk-detector.ts` (the
 * web adapter) does not import this module at all. It exists so that a stray
 * import cannot break the web bundle.
 */
class WalkDetectorModule extends NativeModule<WalkDetectorModuleEvents> {
  async start(): Promise<boolean> {
    return false;
  }

  async stop(): Promise<boolean> {
    return false;
  }

  async queryHistory(_sinceMs: number): Promise<WalkEvent[]> {
    return [];
  }

  async getDiagnostics(): Promise<WalkDetectorDiagnostics> {
    return {
      isPedometerAvailable: false,
      isActivityAvailable: false,
      motionAuthorization: 'unavailable',
      systemVersion: 'web',
      isSimulator: false,
      isRunning: false,
      mechanism: 'none',
      locationAuthorization: 'unavailable',
      warnings: [],
    };
  }

  async emitTestEvent(): Promise<boolean> {
    return false;
  }
}

export default registerWebModule(WalkDetectorModule, 'WalkDetectorModule');
