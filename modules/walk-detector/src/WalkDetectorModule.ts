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
  /**
   * Withholds the walk notification without stopping detection. Separate from
   * `start` so that function's arity — and its argument marshalling, which no
   * gate here verifies — stays untouched.
   */
  setNotificationsEnabled(enabled: boolean): Promise<boolean>;
  /**
   * Sets the step bar a walk must pass to qualify. Applies to the next
   * pedometer callback — thresholdSteps is read live from UserDefaults, so no
   * restart is needed. Separate from `start` for the same arity reason as
   * `setNotificationsEnabled`.
   */
  setThresholdSteps(steps: number): Promise<boolean>;
  /** Minimum gap between two walk notifications. Applies to the next check, no restart. */
  setCooldownSeconds(seconds: number): Promise<boolean>;
  /** How long to stay still before a walk counts as over. Applies to debounces scheduled after the call. */
  setEndDebounceSeconds(seconds: number): Promise<boolean>;
  queryHistory(sinceMs: number): Promise<WalkEvent[]>;
  getDiagnostics(): Promise<WalkDetectorDiagnostics>;
  /** Fires one synthetic `onWalkDetected`, to verify event wiring before F1 exists. */
  emitTestEvent(): Promise<boolean>;
}

export default requireNativeModule<WalkDetectorModule>('WalkDetector');
