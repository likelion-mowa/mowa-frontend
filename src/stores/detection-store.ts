import { create } from 'zustand';

import { SECURE_KEYS, secureStore, walkDetector, type WalkDetectorDiagnostics } from '@/adapters';

/**
 * 설정 > 산책 감지. Two preferences, both of which the user can only really
 * observe on a device:
 *
 * - `enabled` starts and stops the detector. This is the app's first product
 *   call to `walkDetector.start()/stop()` — before this, only /debug did it.
 * - `notificationsEnabled` withholds the walk notification without stopping
 *   detection. The Core posts the notification natively, so this has to reach
 *   Swift; a JS-side flag could not suppress anything.
 *
 * Both are mirrored into SecureStorePort. iOS already persists them in
 * UserDefaults (the Core re-arms itself at launch before JS runs), but web has
 * no such thing, and even on iOS the stored copy is what lets the screen render
 * the right switch position on the very first frame.
 *
 * The two stores can disagree: the Keychain outlives app deletion, UserDefaults
 * does not. `load()` reconciles rather than trusting either.
 */

export type DetectionPhase = 'idle' | 'loading' | 'ready' | 'unavailable';

type DetectionState = {
  phase: DetectionPhase;
  /** What the user asked for. */
  enabled: boolean;
  notificationsEnabled: boolean;
  /** Null until the first successful read; web never has one. */
  diagnostics: WalkDetectorDiagnostics | null;
  /** Non-null when start/stop failed — the screen shows it instead of lying. */
  error: string | null;
  log: string[];

  load(): Promise<void>;
  refreshDiagnostics(): Promise<void>;
  setEnabled(next: boolean): Promise<void>;
  setNotificationsEnabled(next: boolean): Promise<void>;
};

async function readFlag(key: string): Promise<boolean | null> {
  const stored = await secureStore.getItem(key);
  if (!stored.ok || stored.value === null) return null;
  return stored.value === 'true';
}

export const useDetection = create<DetectionState>((set, get) => {
  const append = (line: string) => {
    console.log(`[MOWA] detection ${line}`);
    set((state) => ({
      log: [`${new Date().toLocaleTimeString()}  ${line}`, ...state.log].slice(0, 40),
    }));
  };

  return {
    phase: 'idle',
    enabled: false,
    notificationsEnabled: true,
    diagnostics: null,
    error: null,
    log: [],

    /**
     * Runs once per signed-in session, from the root layout — the only place
     * that knows the app just booted.
     */
    load: async () => {
      if (!walkDetector.isAvailable) {
        set({ phase: 'unavailable' });
        return;
      }
      set({ phase: 'loading' });

      const storedEnabled = await readFlag(SECURE_KEYS.detectionEnabled);
      const storedNotifications = await readFlag(SECURE_KEYS.notificationsEnabled);

      const read = await walkDetector.getDiagnostics();
      if (!read.ok) {
        append(`diagnostics FAILED — ${read.error}`);
        set({
          phase: 'ready',
          enabled: storedEnabled ?? false,
          notificationsEnabled: storedNotifications ?? true,
          error: read.error,
        });
        return;
      }

      const diagnostics = read.value;
      // No stored preference yet (fresh install, or a reinstall that wiped the
      // Keychain): adopt what the detector is actually doing.
      const enabled = storedEnabled ?? diagnostics.isRunning;
      const notificationsEnabled = storedNotifications ?? diagnostics.notificationsEnabled;

      set({ phase: 'ready', enabled, notificationsEnabled, diagnostics, error: null });

      // Reconcile: the preference is intent, `isRunning` is reality.
      if (enabled && !diagnostics.isRunning) {
        append('reconcile: preference on but detector idle — starting');
        const started = await walkDetector.start();
        if (!started.ok) {
          // Deliberately NOT flipping the preference off. This is the revoked
          // Always-location case, where the Core skips the keepalive half
          // silently; the user's intent is still "on" and the screen must say
          // why it is not running rather than quietly agreeing it is off.
          append(`reconcile: start FAILED — ${started.error}`);
          set({ error: started.error });
        }
      } else if (!enabled && diagnostics.isRunning) {
        // Recovers from a detector left running by /debug.
        append('reconcile: preference off but detector running — stopping');
        const stopped = await walkDetector.stop();
        if (!stopped.ok) set({ error: stopped.error });
      }

      // The Core's own copy is the one that gates posting, so push the
      // preference down whenever the two disagree.
      if (notificationsEnabled !== diagnostics.notificationsEnabled) {
        await walkDetector.setNotificationsEnabled(notificationsEnabled);
      }

      await get().refreshDiagnostics();
    },

    refreshDiagnostics: async () => {
      if (!walkDetector.isAvailable) return;
      const read = await walkDetector.getDiagnostics();
      if (read.ok) set({ diagnostics: read.value });
    },

    setEnabled: async (next) => {
      const previous = get().enabled;
      // Optimistic: the switch must move under the finger, not after a round
      // trip through CoreMotion's permission prompt.
      set({ enabled: next, error: null });
      await secureStore.setItem(SECURE_KEYS.detectionEnabled, String(next));

      const result = next ? await walkDetector.start() : await walkDetector.stop();
      if (!result.ok) {
        append(`${next ? 'start' : 'stop'} FAILED — ${result.error}`);
        set({ enabled: previous, error: result.error });
        await secureStore.setItem(SECURE_KEYS.detectionEnabled, String(previous));
        return;
      }

      append(next ? 'detection started' : 'detection stopped');
      await get().refreshDiagnostics();
    },

    setNotificationsEnabled: async (next) => {
      const previous = get().notificationsEnabled;
      set({ notificationsEnabled: next, error: null });
      await secureStore.setItem(SECURE_KEYS.notificationsEnabled, String(next));

      const result = await walkDetector.setNotificationsEnabled(next);
      if (!result.ok) {
        append(`setNotificationsEnabled FAILED — ${result.error}`);
        set({ notificationsEnabled: previous, error: result.error });
        await secureStore.setItem(SECURE_KEYS.notificationsEnabled, String(previous));
        return;
      }

      append(`notifications ${next ? 'on' : 'off'}`);
      await get().refreshDiagnostics();
    },
  };
});
