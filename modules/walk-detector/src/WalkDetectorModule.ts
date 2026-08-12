import { NativeModule, requireNativeModule } from 'expo';

import type {
  WalkDetectorDiagnostics,
  WalkDetectorModuleEvents,
  WalkEvent,
} from './WalkDetector.types';

declare class WalkDetectorModule extends NativeModule<WalkDetectorModuleEvents> {
  /** Begins detection. Also triggers the iOS "Motion & Fitness" permission prompt. */
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  queryHistory(sinceMs: number): Promise<WalkEvent[]>;
  getDiagnostics(): Promise<WalkDetectorDiagnostics>;
  /** Fires one synthetic `onWalkDetected`, to verify event wiring before F1 exists. */
  emitTestEvent(): Promise<boolean>;
}

export default requireNativeModule<WalkDetectorModule>('WalkDetector');
