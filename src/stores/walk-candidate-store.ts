import { create } from 'zustand';

import { storage, walkDetector, type DetectedWalk, type WalkEvent } from '@/adapters';
import { api, hasAccessToken, setAccessToken } from '@/api/client';
import {
  fromIsoDateTime,
  toIsoDateTime,
  type CandidateStatus,
  type UpdateWalkCandidateRequest,
} from '@/api/types';

/**
 * The detect → candidate → suggestion flow.
 *
 * Detection: WalkEvent in, `POST /walk-candidates` out, end values PATCHed on
 * top, and the detection persisted locally with the server's candidateId
 * stamped on it. The detector fires once, after the walk is over (the Core
 * debounces the stationary period), so a live event already carries its end.
 *
 * Suggestion: the notification tap opens /walk, which drives the status
 * transitions — SUGGESTED on entry, then RECORDING (남기기) or SKIPPED
 * (건너뛰기). Screens read this store; only the store talks to the api client
 * and the adapters.
 *
 * The observer safety net never reaches this flow: it posts its notification
 * natively and emits no JS event (WalkDetectorCore.handleObserverFired), so a
 * tap on one of its notifications finds no local candidate and lands back on
 * the home screen. Reconciling those walks via queryHistory is a follow-up
 * task — see docs/api-implementation.md 공백 2.
 */

type AuthState = 'none' | 'ok' | 'failed';

/**
 * Where the walk's end time came from. `detector` is the real thing: the Core
 * reports when the user actually stopped. `entry-time` is the last-resort
 * stamp for a detection that never got one (a stub event, or web), used only
 * because 기능 5 refuses to finalize a candidate without an end.
 */
export type EndSource = 'detector' | 'entry-time';

export type SuggestionPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'submitting'
  /** The choice reached the server; the screen leaves. */
  | 'done'
  /** No candidate to act on: stale tap, unknown to the server, or no session. */
  | 'missing';

export type ActiveCandidate = {
  candidateId: string;
  startedAtMs: number;
  endedAtMs: number | null;
  durationSeconds: number | null;
  endSource: EndSource | null;
  /** null when the server could not be reached — the buttons retry from scratch. */
  serverStatus: CandidateStatus | null;
  /** True once the server holds a non-null detectedEndAt for this candidate. */
  endSyncedToServer: boolean;
};

type WalkCandidateFlowState = {
  authState: AuthState;
  lastDetection: DetectedWalk | null;
  log: string[];

  suggestionPhase: SuggestionPhase;
  activeCandidate: ActiveCandidate | null;

  loginWithEnvCredentials(): Promise<boolean>;
  handleWalkEvent(event: WalkEvent): Promise<void>;
  /** Idempotent. Returns the unsubscribe for the layout effect's cleanup. */
  startCandidateFlow(): () => void;

  /** /walk mount: resolve the candidate, sync it, mark it SUGGESTED. */
  openSuggestion(): Promise<void>;
  chooseKeep(): Promise<void>;
  chooseSkip(): Promise<void>;
};

// Module scope, not store state: Fast Refresh remounts the layout effect, and
// a second live subscription would POST every detection twice.
let subscribed = false;
let storageReady = false;
/**
 * Only a NEWER openSuggestion supersedes an older one — nothing else may
 * invalidate a run.
 *
 * Measured on device 2026-08-14: a notification tap mounted /walk twice, and
 * an unmount-time reset (the screen used to call closeSuggestion) cancelled
 * the *newer* mount's in-flight work and wiped its state, leaving a blank
 * screen and a candidate stuck at DETECTED. The screen now owns nothing that
 * a sibling instance can cancel.
 */
let suggestionRun = 0;

/** Server-side CHECK: detected_end_at >= detected_start_at, duration >= 0. */
function toEndPatch(
  startedAtMs: number,
  endedAtMs: number,
): Required<Pick<UpdateWalkCandidateRequest, 'detectedEndAt' | 'durationSeconds'>> {
  const safeEnd = Math.max(endedAtMs, startedAtMs);
  return {
    detectedEndAt: toIsoDateTime(safeEnd),
    durationSeconds: Math.round((safeEnd - startedAtMs) / 1000),
  };
}

export const useWalkCandidateFlow = create<WalkCandidateFlowState>((set, get) => {
  const append = (line: string) => {
    // Mirrored to the console so device logs capture the same evidence the
    // /debug screen shows.
    console.log(`[MOWA] flow ${line}`);
    set((state) => ({
      log: [`${new Date().toLocaleTimeString()}  ${line}`, ...state.log].slice(0, 40),
    }));
  };

  /** Lazily authenticates. Returns false when the app has no usable session. */
  const ensureToken = async (): Promise<boolean> => {
    if (hasAccessToken()) return true;
    return get().loginWithEnvCredentials();
  };

  const ensureStorage = async (): Promise<boolean> => {
    if (storageReady) return true;
    const init = await storage.init();
    if (init.ok) storageReady = true;
    else append(`storage.init FAILED — ${init.error}`);
    return storageReady;
  };

  /**
   * The candidate the tap refers to. Warm: the detection still in memory.
   * Cold (the app was launched by the tap): the newest stored detection that
   * reached the server. There is no list endpoint, so a detection whose POST
   * failed is unreachable here — by design, it is logged, not guessed at.
   */
  const resolveLocalDetection = async (): Promise<DetectedWalk | null> => {
    const inMemory = get().lastDetection;
    if (inMemory?.candidateId != null) return inMemory;

    if (!(await ensureStorage())) return null;
    const stored = await storage.listWalks();
    if (!stored.ok) {
      append(`listWalks FAILED — ${stored.error}`);
      return null;
    }
    // Newest by END, not by start: a walk that began 20 minutes ago and just
    // finished is the one the notification is about, even though a shorter
    // walk stored before it may have started later.
    return stored.value
      .filter((walk) => walk.candidateId !== null)
      .reduce<DetectedWalk | null>((newest, walk) => {
        if (newest === null) return walk;
        return (walk.endedAtMs ?? walk.startedAtMs) > (newest.endedAtMs ?? newest.startedAtMs)
          ? walk
          : newest;
      }, null);
  };

  /**
   * 남기기 / 건너뛰기. Both first make sure the candidate is SUGGESTED — the
   * server's transition table only allows SUGGESTED → RECORDING | SKIPPED, and
   * the entry PATCH may have failed or never run.
   *
   * RECORDING additionally guarantees the end values: without them 기능 5
   * refuses to finalize the experience, and by then the detection is long gone.
   */
  const submitChoice = async (status: 'RECORDING' | 'SKIPPED'): Promise<void> => {
    const active = get().activeCandidate;
    if (active === null || get().suggestionPhase !== 'ready') return;
    set({ suggestionPhase: 'submitting' });

    const fail = (line: string) => {
      append(line);
      set({ suggestionPhase: 'ready' });
    };

    if (!(await ensureToken())) {
      fail('suggestion: no session — choice not sent');
      return;
    }

    let synced = active.endSyncedToServer;

    if (active.serverStatus !== 'SUGGESTED') {
      const patch: UpdateWalkCandidateRequest = { status: 'SUGGESTED' };
      if (!synced && active.endedAtMs !== null) {
        Object.assign(patch, toEndPatch(active.startedAtMs, active.endedAtMs));
      }
      const updated = await api.updateWalkCandidate(active.candidateId, patch);
      if (!updated.ok) {
        fail(
          `suggestion: SUGGESTED retry FAILED (${updated.status ?? 'network'}) — ${updated.error}`,
        );
        return;
      }
      synced = updated.value.detectedEndAt !== null;
    }

    const body: UpdateWalkCandidateRequest = { status };
    let endSource = active.endSource;
    if (status === 'RECORDING' && !synced) {
      // Falls back to now only when the detection never carried an end (a stub
      // event, or web). A real walk always arrives with the detector's value.
      const endedAtMs = active.endedAtMs ?? Date.now();
      if (active.endedAtMs === null) endSource = 'entry-time';
      Object.assign(body, toEndPatch(active.startedAtMs, endedAtMs));
    }

    const updated = await api.updateWalkCandidate(active.candidateId, body);
    if (!updated.ok) {
      fail(`suggestion: ${status} PATCH FAILED (${updated.status ?? 'network'}) — ${updated.error}`);
      return;
    }

    append(
      `suggestion: candidate ${updated.value.status}` +
        (status === 'RECORDING' ? ` endSource=${endSource ?? 'server'}` : ''),
    );
    // The server response is the freshest truth, and for an entry-time
    // fallback it is the ONLY place the stamped end values exist — the diary
    // flow copies them from here, so dropping them showed 소요 시간 '—'.
    const serverEnd = updated.value.detectedEndAt;
    set({
      suggestionPhase: 'done',
      activeCandidate: {
        ...active,
        serverStatus: updated.value.status,
        endSyncedToServer: serverEnd !== null,
        endSource,
        endedAtMs: serverEnd !== null ? fromIsoDateTime(serverEnd) : active.endedAtMs,
        durationSeconds: updated.value.durationSeconds ?? active.durationSeconds,
      },
    });
  };

  return {
    authState: 'none',
    lastDetection: null,
    log: [],
    suggestionPhase: 'idle',
    activeCandidate: null,

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
      append(`event ${event.source} steps=${event.steps} ended=${event.endedAtMs ?? 'null'}`);

      const detected: DetectedWalk = {
        id: event.id,
        startedAtMs: event.startedAtMs,
        endedAtMs: event.endedAtMs,
        steps: event.steps,
        locationSummary: null, // reverse geocoding is out of scope for now
        candidateId: null,
      };

      await ensureStorage();
      await ensureToken();

      if (hasAccessToken()) {
        const created = await api.createWalkCandidate({
          detectedStartAt: toIsoDateTime(event.startedAtMs),
        });
        if (created.ok) {
          detected.candidateId = created.value.candidateId;
          append(`candidate created ${created.value.candidateId}`);

          // The end values ride in right behind the creation: 기능 5 rejects a
          // candidate without them, and the detector already knows the walk is
          // over. A stub event (emitTestEvent, web) has no end — the
          // suggestion screen stamps one when the user chooses 남기기.
          if (event.endedAtMs !== null) {
            const patch = toEndPatch(event.startedAtMs, event.endedAtMs);
            const updated = await api.updateWalkCandidate(created.value.candidateId, patch);
            if (updated.ok) append(`candidate end set duration=${patch.durationSeconds}s`);
            else append(`candidate end PATCH FAILED (${updated.status ?? 'network'}) — ${updated.error}`);
          }
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

    openSuggestion: async () => {
      const run = ++suggestionRun;
      // A superseded run must not touch state; neither must one that is still
      // in flight when the user has already pressed a button.
      const superseded = () => run !== suggestionRun || get().suggestionPhase === 'submitting';
      const giveUp = (line: string) => {
        append(line);
        if (!superseded()) set({ suggestionPhase: 'missing', activeCandidate: null });
      };

      set({ suggestionPhase: 'loading', activeCandidate: null });

      const local = await resolveLocalDetection();
      if (superseded()) return;
      if (local?.candidateId == null) {
        giveUp('suggestion: no local candidate for this tap');
        return;
      }

      if (!(await ensureToken())) {
        giveUp('suggestion: no session — cannot reach the candidate');
        return;
      }
      if (superseded()) return;

      const candidateId = local.candidateId;
      const active: ActiveCandidate = {
        candidateId,
        startedAtMs: local.startedAtMs,
        endedAtMs: local.endedAtMs,
        durationSeconds:
          local.endedAtMs === null
            ? null
            : toEndPatch(local.startedAtMs, local.endedAtMs).durationSeconds,
        endSource: local.endedAtMs === null ? null : 'detector',
        serverStatus: null,
        endSyncedToServer: false,
      };

      const fetched = await api.getWalkCandidate(candidateId);
      if (superseded()) return;

      if (fetched.ok) {
        const server = fetched.value;
        active.serverStatus = server.status;
        active.endSyncedToServer = server.detectedEndAt !== null;
        if (server.detectedEndAt !== null) {
          // The server's copy wins for display: it is what 기능 5 will read.
          active.endedAtMs = fromIsoDateTime(server.detectedEndAt);
          active.durationSeconds = server.durationSeconds;
          active.endSource = active.endSource ?? 'detector';
        }

        if (server.status === 'SKIPPED') {
          // A notification stays in Notification Center until it is replaced,
          // so a tap can arrive long after the walk was already handled.
          giveUp('suggestion: stale tap — candidate is already SKIPPED');
          return;
        }

        if (server.status === 'RECORDING') {
          // Not stale — the user chose 저장할게요 and left the diary flow
          // before finishing. The server's transition table pins the candidate
          // at RECORDING forever, so bouncing this tap home would make the
          // walk permanently unrecordable. Hand it straight back to the flow;
          // /walk's redirect reads phase 'done' + RECORDING as "resume diary".
          append('suggestion: candidate already RECORDING — resuming the diary flow');
          set({ suggestionPhase: 'done', activeCandidate: active });
          return;
        }

        if (server.status === 'DETECTED') {
          const patch: UpdateWalkCandidateRequest = { status: 'SUGGESTED' };
          if (!active.endSyncedToServer && active.endedAtMs !== null) {
            Object.assign(patch, toEndPatch(active.startedAtMs, active.endedAtMs));
          }
          const updated = await api.updateWalkCandidate(candidateId, patch);
          if (superseded()) return;
          if (updated.ok) {
            active.serverStatus = updated.value.status;
            active.endSyncedToServer = updated.value.detectedEndAt !== null;
            append('suggestion: candidate marked SUGGESTED');
          } else {
            // Not fatal: the screen still offers the choice, and the buttons
            // re-run the transition from whatever the server actually holds.
            append(`suggestion: SUGGESTED PATCH FAILED (${updated.status ?? 'network'}) — ${updated.error}`);
          }
        } else if (!active.endSyncedToServer && active.endedAtMs !== null) {
          // Already SUGGESTED but missing its end values (the detection-time
          // PATCH failed). Send them alone — omitting `status` cannot trip a
          // transition rule.
          const updated = await api.updateWalkCandidate(
            candidateId,
            toEndPatch(active.startedAtMs, active.endedAtMs),
          );
          if (superseded()) return;
          if (updated.ok) {
            active.endSyncedToServer = updated.value.detectedEndAt !== null;
            append('suggestion: end values backfilled');
          } else {
            append(`suggestion: end PATCH FAILED (${updated.status ?? 'network'}) — ${updated.error}`);
          }
        }
      } else if (fetched.status === 404) {
        giveUp('suggestion: candidate not found on the server');
        return;
      } else if (fetched.status !== null) {
        giveUp(`suggestion: GET failed (${fetched.status}) — ${fetched.error}`);
        return;
      } else {
        // Network only: show the screen anyway and let the buttons retry.
        append(`suggestion: GET unreachable — ${fetched.error}`);
      }

      if (superseded()) return;
      set({ suggestionPhase: 'ready', activeCandidate: active });
    },

    chooseKeep: async () => {
      await submitChoice('RECORDING');
    },

    chooseSkip: async () => {
      await submitChoice('SKIPPED');
    },
  };
});
