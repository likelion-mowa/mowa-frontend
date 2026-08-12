import { create } from 'zustand';

import type {
  LocationPermission,
  PermissionState,
  WalkDetectorDiagnostics,
  WalkEvent,
} from '@/adapters';

/**
 * State for the environment smoke screen.
 *
 * Stores talk to adapters, never to native modules directly. This one holds
 * only what the screen renders; it is throwaway once real feature stores exist.
 */
type DiagnosticsState = {
  motion: PermissionState;
  locationPermission: LocationPermission;
  healthAvailable: boolean | null;
  healthAuthorization: PermissionState;
  healthResult: string | null;
  notificationPermission: PermissionState;
  diagnostics: WalkDetectorDiagnostics | null;
  history: WalkEvent[];
  lastEvent: WalkEvent | null;
  log: string[];

  set<K extends keyof DiagnosticsState>(key: K, value: DiagnosticsState[K]): void;
  append(line: string): void;
};

export const useDiagnostics = create<DiagnosticsState>((set) => ({
  motion: 'unknown',
  locationPermission: { foreground: 'unknown', background: 'unknown' },
  healthAvailable: null,
  healthAuthorization: 'unknown',
  healthResult: null,
  notificationPermission: 'unknown',
  diagnostics: null,
  history: [],
  lastEvent: null,
  log: [],

  set: (key, value) => set({ [key]: value } as Pick<DiagnosticsState, typeof key>),

  append: (line) => {
    // Mirrored to the console so device logs capture the same evidence the
    // screen shows. Prefixed for filtering: `log stream --predicate ...MOWA`.
    console.log(`[MOWA] ${line}`);
    set((state) => ({
      log: [`${new Date().toLocaleTimeString()}  ${line}`, ...state.log].slice(0, 40),
    }));
  },
}));
