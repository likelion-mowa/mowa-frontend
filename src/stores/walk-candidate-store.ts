import { create } from 'zustand';

import { storage, walkDetector, type DetectedWalk, type WalkEvent } from '@/adapters';
import { api, hasAccessToken, setAccessToken } from '@/api/client';
import { toIsoDateTime } from '@/api/types';

/**
 * The detect → candidate flow: WalkEvent in, `POST /walk-candidates` out, and
 * the detection persisted locally with the server's candidateId stamped on it.
 *
 * Runs headless from the root layout. Screens read this store; only the store
 * talks to the api client and the adapters.
 *
 * The observer safety net never reaches this flow: it posts its notification
 * natively and emits no JS event (WalkDetectorCore.handleObserverFired).
 * Reconciling those walks via queryHistory is a follow-up task — see
 * docs/api-implementation.md 공백 2.
 */

type AuthState = 'none' | 'ok' | 'failed';

type WalkCandidateFlowState = {
  authState: AuthState;
  lastDetection: DetectedWalk | null;
  log: string[];

  loginWithEnvCredentials(): Promise<boolean>;
  handleWalkEvent(event: WalkEvent): Promise<void>;
  /** Idempotent. Returns the unsubscribe for the layout effect's cleanup. */
  startCandidateFlow(): () => void;
};

// Module scope, not store state: Fast Refresh remounts the layout effect, and
// a second live subscription would POST every detection twice.
let subscribed = false;
let storageReady = false;

export const useWalkCandidateFlow = create<WalkCandidateFlowState>((set, get) => {
  const append = (line: string) => {
    // Mirrored to the console so device logs capture the same evidence the
    // /debug screen shows.
    console.log(`[MOWA] flow ${line}`);
    set((state) => ({
      log: [`${new Date().toLocaleTimeString()}  ${line}`, ...state.log].slice(0, 40),
    }));
  };

  return {
    authState: 'none',
    lastDetection: null,
    log: [],

    loginWithEnvCredentials: async () => {
      const loginId = process.env.EXPO_PUBLIC_MOCK_LOGIN_ID;
      const password = process.env.EXPO_PUBLIC_MOCK_PASSWORD;
      if (!loginId || !password) {
        append('login skipped — EXPO_PUBLIC_MOCK_LOGIN_ID/PASSWORD not set');
        return false;
      }
      const result = await api.login({ loginId, password });
      if (result.ok) {
        setAccessToken(result.value.accessToken);
        set({ authState: 'ok' });
        append(`login ok as ${loginId}`);
        return true;
      }
      set({ authState: 'failed' });
      append(`login FAILED (${result.status ?? 'network'}) — ${result.error}`);
      return false;
    },

    handleWalkEvent: async (event) => {
      append(`event ${event.source} steps=${event.steps}`);

      const detected: DetectedWalk = {
        id: event.id,
        startedAtMs: event.startedAtMs,
        endedAtMs: event.endedAtMs,
        steps: event.steps,
        locationSummary: null, // reverse geocoding is out of scope for PR A
        candidateId: null,
      };

      if (!storageReady) {
        const init = await storage.init();
        if (init.ok) storageReady = true;
        else append(`storage.init FAILED — ${init.error}`);
      }

      if (!hasAccessToken()) await get().loginWithEnvCredentials();

      if (hasAccessToken()) {
        const created = await api.createWalkCandidate({
          detectedStartAt: toIsoDateTime(event.startedAtMs),
        });
        if (created.ok) {
          detected.candidateId = created.value.candidateId;
          append(`candidate created ${created.value.candidateId}`);
        } else {
          append(`candidate POST FAILED (${created.status ?? 'network'}) — ${created.error}`);
        }
      } else {
        append('no token — detection kept locally only');
      }

      // The detection survives even when the server does not have it yet;
      // a null candidateId is what marks it for a future retry/reconcile.
      if (storageReady) {
        const inserted = await storage.insertWalk(detected);
        if (!inserted.ok) append(`insertWalk FAILED — ${inserted.error}`);
      }

      set({ lastDetection: detected });
    },

    startCandidateFlow: () => {
      if (subscribed) return () => {};
      subscribed = true;
      const unsubscribe = walkDetector.subscribe((event) => {
        void get().handleWalkEvent(event);
      });
      append(`flow started (detector available: ${walkDetector.isAvailable})`);
      return () => {
        subscribed = false;
        unsubscribe();
      };
    },
  };
});
