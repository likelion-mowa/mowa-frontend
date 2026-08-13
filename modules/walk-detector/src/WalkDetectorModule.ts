import { NativeModule, requireNativeModule } from 'expo';

import type {
  WalkDetectorDiagnostics,
  WalkDetectorModuleEvents,
  WalkEvent,
  WalkMechanism,
} from './WalkDetector.types';

declare class WalkDetectorModule extends NativeModule<WalkDetectorModuleEvents> {
  /**
   * Begins detection with the given mechanism (`null` = the native default,
   * layered: keepalive + observer safety net) and triggers that mechanism's
   * permission prompts: Motion & Fitness for keepalive, the HealthKit read
   * sheet for the observer — layered raises both.
   * Callers pass the argument explicitly (never omit it) so the Swift arity
   * stays fixed — optional-argument marshalling is verified by no gate here.
   */
  start(mechanism: WalkMechanism | null): Promise<boolean>;
  stop(): Promise<boolean>;
  queryHistory(sinceMs: number): Promise<WalkEvent[]>;
  getDiagnostics(): Promise<WalkDetectorDiagnostics>;
  /** Fires one synthetic `onWalkDetected`, to verify event wiring before F1 exists. */
  emitTestEvent(): Promise<boolean>;
}

export default requireNativeModule<WalkDetectorModule>('WalkDetector');
