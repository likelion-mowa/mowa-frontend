import { create } from 'zustand';

import { location, storage, walkDetector, type DetectedWalk, type WalkEvent } from '@/adapters';
import { api, hasAccessToken } from '@/api/client';
import {
  fromIsoDateTime,
  toIsoDateTime,
  type CandidateStatus,
  type UpdateWalkCandidateRequest,
} from '@/api/types';
import { pickLocationSummary } from '@/lib/location-summary';

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
 * The observer safety net posts its notification natively and emits no JS event
 * (WalkDetectorCore.handleObserverFired), and its notification carries no walk
 * identity at all — the observer itself only knows a 2-hour cumulative step
 * delta, never a start or an end. So its walks reach this flow the only way
 * they can: on entry, /walk asks the detector for its history and adopts the
 * walk the notification was about (reconcile, below).
 *
 * That path POSTs at most once per detected walk — the local buffer is the
 * ledger — which is what keeps the "duplicate candidates are harmless" verdict
 * in docs/api-implementation.md 공백 5 true now that the client does retry.
 * There is still no candidate list endpoint (공백 1), so a wiped buffer cannot
 * be recovered from the server, and reconcile refuses to run without one.
 */

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
  /**
   * Carried through so the diary flow can show it: /diary/preview and
   * /diary/done render before any `walk_experiences` row exists, so the server
   * is not a source for them and this is the only path the value has.
   */
  locationSummary: string | null;
  /** null when the server could not be reached — the buttons retry from scratch. */
  serverStatus: CandidateStatus | null;
  /** True once the server holds a non-null detectedEndAt for this candidate. */
  endSyncedToServer: boolean;
};

type WalkCandidateFlowState = {
  lastDetection: DetectedWalk | null;
  log: string[];

  suggestionPhase: SuggestionPhase;
  activeCandidate: ActiveCandidate | null;
  /**
   * When the notification that sent the user here was posted, or null for an
   * entry that was not a tap (the home DetectionCard, /debug). The suggestion
   * run anchors on it — see `noteNotificationTap`.
   */
  tapIssuedAtMs: number | null;

  handleWalkEvent(event: WalkEvent): Promise<void>;
  /** Idempotent. Returns the unsubscribe for the layout effect's cleanup. */
  startCandidateFlow(): () => void;
  /** Called by the root layout on a notification tap, before /walk mounts. */
  noteNotificationTap(issuedAtMs: number | null): void;

  /** /walk mount: resolve the candidate, sync it, mark it SUGGESTED. */
  openSuggestion(): Promise<void>;
  chooseKeep(): Promise<void>;
  chooseSkip(): Promise<void>;
  /** Sign-out. Drops everything scoped to the user who just left. */
  reset(): void;
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
/**
 * Single-flight for reconcile. A notification tap was measured mounting /walk
 * twice (see above), and `POST /walk-candidates` has no idempotency key
 * (docs/api-implementation.md 공백 5) — two concurrent runs would create two
 * candidates for one walk. `superseded()` cannot help: it gates state writes,
 * not a network call that has already left.
 */
let reconcileInFlight: Promise<DetectedWalk | null> | null = null;

/**
 * How far back a notification tap may reach for the walk it is about.
 *
 * Not an arbitrary round number. The observer reads an HKStatisticsQuery over
 * [now − 2h, now] and notifies on the delta between two such window sums
 * (WalkDetectorCore.handleObserverFired). A sample enters that window by being
 * DATED inside it, so the walk that caused a fire always ended within 2h of the
 * fire — a late Apple Watch sync included, since it is filtered by sample date
 * rather than arrival time. The extra hour covers the fire → post lag and a tap
 * whose issuedAtMs we could not read.
 */
const RECONCILE_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * A local candidate this close to the notification IS the notification's walk,
 * so the history query is skipped entirely. The live path posts one endDebounce
 * (180 s) after the walk ended; the observer posts 7–18 min after (measured
 * 2026-08-13). 20 min clears both with margin.
 */
const LOCAL_MATCH_MS = 20 * 60 * 1000;

/** Do two closed intervals touch? */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Is this history row a walk the local buffer already holds?
 *
 * Overlap, not id equality, is the real test — the id is only a cheap first
 * check. Two reasons matching ids alone fails: the live path absorbs stops
 * under 180 s into ONE walk while the history query splits a segment on every
 * non-walking row, so one live walk spans several history rows; and
 * `retro-<epochSec>` is not stable across taps, because queryActivityStarting
 * is called with a `since` that moves with the anchor.
 *
 * Deliberately compared against EVERY stored row, including ones whose POST
 * failed (candidateId null). That makes adoption at-most-once per detected walk
 * forever: a lost POST is never retried, which is exactly the retry that would
 * invalidate 공백 5's harmless-duplicates verdict. A2's target — an observer
 * walk with no local row at all — is unaffected.
 */
function isKnownLocally(row: WalkEvent, stored: DetectedWalk[]): boolean {
  const rowEnd = row.endedAtMs ?? row.startedAtMs;
  return stored.some(
    (walk) =>
      walk.id === row.id ||
      overlaps(row.startedAtMs, rowEnd, walk.startedAtMs, walk.endedAtMs ?? walk.startedAtMs),
  );
}

/**
 * How recent a walk's end must be for "where I am now" to be a fair label.
 *
 * Deliberately a check on the walk's clock, not on `event.source`. Reconcile
 * adopts walks up to RECONCILE_WINDOW_MS (3 hours) old, and stamping those with
 * the current position would put the wrong neighbourhood on them — but a
 * retrospective row whose walk ended two minutes ago deserves the label as much
 * as a live one does, and a synthetic /debug event is by construction "now",
 * which is what keeps this path testable without walking for twenty minutes.
 *
 * The live path fires only after the Core's end debounce (~180s), so the bound
 * has to clear that comfortably or real walks would be excluded.
 */
const PLACE_FRESHNESS_MS = 10 * 60 * 1000;

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

  const ensureStorage = async (): Promise<boolean> => {
    if (storageReady) return true;
    const init = await storage.init();
    if (init.ok) storageReady = true;
    else append(`storage.init FAILED — ${init.error}`);
    return storageReady;
  };

  /**
   * "Where am I now" as this walk's place, or null whenever that would be a lie
   * or is simply unavailable — on web, without permission, with no fix, or when
   * the geocoder names no administrative level.
   *
   * Every one of those paths is logged: a location that silently never appears
   * is indistinguishable from one the user's phone cannot produce, and that
   * ambiguity is the failure class this repo pays most for.
   */
  const readPlaceSummary = async (event: WalkEvent): Promise<string | null> => {
    const ageMs = Date.now() - (event.endedAtMs ?? event.startedAtMs);
    if (ageMs > PLACE_FRESHNESS_MS) {
      append(`place skipped — walk ended ${Math.round(ageMs / 60000)}min ago`);
      return null;
    }

    const read = await location.getCurrentPlace();
    if (!read.ok) {
      append(`place FAILED — ${read.error}`);
      return null;
    }

    const summary = pickLocationSummary(read.value.addresses);
    append(
      summary === null
        ? `place: no usable field in ${read.value.addresses.length} address(es)`
        : `place: ${summary} (fix ${read.value.fixAgeMs}ms, read ${read.value.elapsedMs}ms)`,
    );
    return summary;
  };

  /**
   * The candidate the tap refers to. Warm: the detection still in memory.
   * Cold (the app was launched by the tap): the newest stored detection that
   * reached the server. There is no list endpoint, so a detection whose POST
   * failed is unreachable here — by design, it is logged, not guessed at.
   *
   * Deliberately unbounded in age. A staleness cut here would break the two
   * paths that legitimately point at an old candidate: the home DetectionCard
   * (src/app/index.tsx renders it with no age limit and pushes /walk), and the
   * RECORDING resume below, which exists so a half-written diary never becomes
   * unreachable. The time window belongs to the history query instead — an old
   * candidate loses because a newer history row wins, not because it was
   * discarded, and when history has nothing it is still better than a blank
   * bounce home.
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
   * The observer path's only way into this flow: ask the detector what it saw
   * around the notification and adopt the walk it was about.
   *
   * `queryHistory` merges the Core's in-memory live events with CMMotionActivity
   * segments, so this also rescues a live detection that fired while signed out
   * (no JS listener was attached, but the Core still recorded it) — with its
   * real step count. Which is why rows are never filtered by `source`.
   *
   * Returns only an adopted walk that actually reached the server. Never call
   * this without checking the result: `handleWalkEvent` sets `lastDetection`
   * even when the POST failed, so returning that unconditionally would replace
   * a usable fallback candidate with an unusable one.
   */
  const reconcileFromHistory = async (anchorMs: number): Promise<DetectedWalk | null> => {
    // Refuse rather than proceed: the buffer is the at-most-once ledger, and
    // without it there is no way to tell a walk already sent from one never
    // sent, so every tap would POST again.
    if (!(await ensureStorage())) {
      append('reconcile: skipped — no local buffer');
      return null;
    }
    const stored = await storage.listWalks();
    if (!stored.ok) {
      append(`reconcile: listWalks FAILED — ${stored.error}`);
      return null;
    }

    const sinceMs = anchorMs - RECONCILE_WINDOW_MS;
    const history = await walkDetector.queryHistory(sinceMs);
    if (!history.ok) {
      append(`reconcile: queryHistory FAILED — ${history.error}`);
      return null;
    }

    const inWindow = history.value.filter(
      (row) =>
        row.endedAtMs !== null &&
        row.endedAtMs >= sinceMs &&
        // Bounded by START, not by end. The observer fires MID-walk whenever
        // the live layer is the thing that died — which is the only condition
        // under which it fires at all, since a live walk in progress suppresses
        // it. A walk that began before the notification and ended after it is
        // still the walk the notification is about.
        row.startedAtMs <= anchorMs &&
        // The history query tests `activity.walking` alone, with no confidence
        // filter, where the live path also demands better than low.
        row.confidence !== 'low',
    );
    const unknown = inWindow.filter((row) => !isKnownLocally(row, stored.value));
    append(
      `reconcile: history rows=${history.value.length} window=${inWindow.length} unknown=${unknown.length}`,
    );

    const pick = unknown.reduce<WalkEvent | null>((newest, row) => {
      if (newest === null) return row;
      return (row.endedAtMs ?? 0) > (newest.endedAtMs ?? 0) ? row : newest;
    }, null);
    if (pick === null) {
      append('reconcile: nothing to adopt');
      return null;
    }

    append(`reconcile: adopting ${pick.id} (${pick.source}) ended=${pick.endedAtMs}`);
    await get().handleWalkEvent(pick);

    const adopted = get().lastDetection;
    return adopted?.candidateId != null ? adopted : null;
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
    // Captured, not bumped: a submit does not supersede anything, but a NEWER
    // openSuggestion supersedes it. Without this, a submit landing after a
    // second tap remounted /walk writes its own terminal state on top of the
    // new run — phase 'done' carrying the PREVIOUS walk's candidate, which
    // walk.tsx reads as "resume the diary" for the wrong walk. Reconcile made
    // the window wide enough to matter: loading is now a native history query
    // plus up to three round trips, not one GET.
    const run = suggestionRun;
    const superseded = () => run !== suggestionRun;
    set({ suggestionPhase: 'submitting' });

    const fail = (line: string) => {
      append(line);
      if (!superseded()) set({ suggestionPhase: 'ready' });
    };

    if (!hasAccessToken()) {
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
    if (superseded()) return;
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
    lastDetection: null,
    log: [],
    suggestionPhase: 'idle',
    activeCandidate: null,
    tapIssuedAtMs: null,

    handleWalkEvent: async (event) => {
      append(`event ${event.source} steps=${event.steps} ended=${event.endedAtMs ?? 'null'}`);

      const detected: DetectedWalk = {
        id: event.id,
        startedAtMs: event.startedAtMs,
        endedAtMs: event.endedAtMs,
        steps: event.steps,
        locationSummary: null, // read below, once the ledger claim is safe
        candidateId: null,
      };

      await ensureStorage();

      const store = async (row: DetectedWalk) => {
        if (!storageReady) return;
        const inserted = await storage.insertWalk(row);
        if (!inserted.ok) append(`insertWalk FAILED — ${inserted.error}`);
      };

      // Claim the walk in the ledger BEFORE the POST, not only after it.
      //
      // Measured on device 2026-08-15: the live path detected a 954-step walk
      // and, while its POST was still in flight, a reconcile run found no row
      // for it and adopted the same walk again — two candidates, identical
      // start/end. `isKnownLocally` compares against STORED rows, so a walk that
      // exists only as an in-flight request is invisible to it, and the
      // at-most-once invariant held only after the request came back.
      //
      // The id is deterministic per walk, and insertWalk is INSERT OR REPLACE,
      // so the write below just fills in the candidateId on the same row. This
      // also closes the smaller hole where the app is killed mid-request and the
      // detection vanishes from the buffer entirely.
      await store(detected);

      // Strictly after the claim above, never before it: the read can take up
      // to its own 8s timeout, and the at-most-once invariant depends on the
      // ledger row existing before anything slow happens. The cost is that the
      // POST below can be delayed by that much — acceptable because the
      // detector's keepalive holds CoreLocation open, so a fix is already in
      // hand when a walk ends (measured: 122ms, on a 2.8s-old fix).
      detected.locationSummary = await readPlaceSummary(event);

      // No session: the detection stays in the local buffer and never becomes
      // a server candidate. Detection runs app-wide, so this is reachable
      // whenever the token expired while the app was in the background.
      if (hasAccessToken()) {
        const created = await api.createWalkCandidate({
          detectedStartAt: toIsoDateTime(event.startedAtMs),
          // Omitted rather than sent as null when there is none, matching how
          // the draft POST treats unset input: the spec has the server invent
          // nothing, and an absent key says that more plainly than a null.
          ...(detected.locationSummary === null
            ? {}
            : { locationSummary: detected.locationSummary }),
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

      // Only when there is something new to record. A failed POST leaves the
      // claim above as the final state: candidateId null marks a detection the
      // server never got, and — per the at-most-once invariant — it is a record,
      // not a retry queue.
      if (detected.candidateId !== null) await store(detected);

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

    /**
     * Stored verbatim, `null` included: a notification without an issuedAtMs
     * must CLEAR an older anchor rather than let the next run inherit it. The
     * anchor is cleared again whenever a run reaches a terminal phase, so a
     * later non-tap entry cannot be anchored on a tap from hours ago.
     */
    noteNotificationTap: (issuedAtMs) => {
      set({ tapIssuedAtMs: issuedAtMs });
    },

    openSuggestion: async () => {
      const run = ++suggestionRun;
      // A superseded run must not touch state; neither must one that is still
      // in flight when the user has already pressed a button.
      const superseded = () => run !== suggestionRun || get().suggestionPhase === 'submitting';
      const giveUp = (line: string) => {
        append(line);
        if (!superseded()) {
          set({ suggestionPhase: 'missing', activeCandidate: null, tapIssuedAtMs: null });
        }
      };

      // The walk sits next to the NOTIFICATION, not next to the tap: a
      // cold-start tap is routed only once the session has restored, and a tap
      // arriving while signed out is preserved and routed at sign-in — possibly
      // hours later. Falling back to now covers a non-tap entry and an older
      // build's notification, which carried no issuedAtMs.
      const tapIssuedAtMs = get().tapIssuedAtMs;
      const anchorMs = tapIssuedAtMs ?? Date.now();
      const tapAnchored = tapIssuedAtMs !== null;

      set({ suggestionPhase: 'loading', activeCandidate: null });

      let local = await resolveLocalDetection();
      if (superseded()) return;

      const localEndMs = local?.endedAtMs ?? local?.startedAtMs ?? null;
      const localMatches =
        local?.candidateId != null && localEndMs !== null && anchorMs - localEndMs <= LOCAL_MATCH_MS;

      // Reconcile when nothing local exists at all, and also when a TAP found
      // only a candidate too old to be its walk — otherwise yesterday's SKIPPED
      // candidate swallows the tap, the run ends at 'stale tap', and the walk
      // the user was actually notified about is never adopted. A non-tap entry
      // never reconciles: the home card points at one specific walk.
      if (local?.candidateId == null || (tapAnchored && !localMatches)) {
        if (!hasAccessToken()) {
          append('reconcile: skipped — no session');
        } else {
          if (reconcileInFlight === null) {
            reconcileInFlight = reconcileFromHistory(anchorMs).finally(() => {
              reconcileInFlight = null;
            });
          } else {
            append('reconcile: joining the run already in flight');
          }
          const adopted = await reconcileInFlight;
          if (superseded()) return;
          // Upgrade only — see reconcileFromHistory.
          if (adopted !== null) local = adopted;
        }
      }

      if (local?.candidateId == null) {
        giveUp('suggestion: no local candidate for this tap');
        return;
      }

      if (!hasAccessToken()) {
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
        locationSummary: local.locationSummary,
        serverStatus: null,
        endSyncedToServer: false,
      };

      const fetched = await api.getWalkCandidate(candidateId);
      if (superseded()) return;

      if (fetched.ok) {
        const server = fetched.value;
        active.serverStatus = server.status;
        active.endSyncedToServer = server.detectedEndAt !== null;
        // The server's copy wins when it has one. A notification tapped after
        // the app was killed rebuilds `local` from SQLite, and a buffer that
        // lost the row leaves it null while the server still holds the value.
        // Guarded rather than assigned outright so a server null cannot erase a
        // value the POST failed to carry.
        if (server.locationSummary !== null) active.locationSummary = server.locationSummary;
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
          set({ suggestionPhase: 'done', activeCandidate: active, tapIssuedAtMs: null });
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
      set({ suggestionPhase: 'ready', activeCandidate: active, tapIssuedAtMs: null });
    },

    chooseKeep: async () => {
      await submitChoice('RECORDING');
    },

    chooseSkip: async () => {
      await submitChoice('SKIPPED');
    },

    /**
     * Sign-out. Bumping the run counter is what stops an openSuggestion still
     * in flight from landing afterwards; `lastDetection` goes too because it
     * carries the previous user's `candidateId`. The SQLite buffer itself is
     * device-scoped and stays — a candidate belonging to another user already
     * resolves to 404 on the server.
     */
    reset: () => {
      suggestionRun += 1;
      set({
        lastDetection: null,
        suggestionPhase: 'idle',
        activeCandidate: null,
        tapIssuedAtMs: null,
      });
    },
  };
});
