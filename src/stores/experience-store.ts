import { create } from 'zustand';

import { api, hasAccessToken } from '@/api/client';
import type {
  ListWalkExperiencesQuery,
  WalkExperienceDetail,
  WalkExperienceListItem,
} from '@/api/types';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * Read side of walk_experiences: the archive list (기능 6) and one detail
 * record (기능 7). Screens read this store; only the store talks to the api
 * client.
 *
 * The list is always fetched unfiltered. The MVP has no pagination, and the
 * stats, the home strip and the calendar all need every row anyway, so the
 * archive's period tabs filter what is already in memory (KST, same boundaries
 * the server uses) instead of paying for a redundant request that can fail on
 * its own. `probeListQuery` keeps the server-side filters honest — see /debug.
 */

export type ExperiencePhase = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';
export type ListPhase = 'idle' | 'loading' | 'ready' | 'error';

/** What /debug reports for a raw query; never touches the screens' list. */
export type ListProbeResult = {
  status: number | null;
  count: number | null;
  error: string | null;
};

type ExperienceState = {
  phase: ExperiencePhase;
  /** The id the current phase/detail belong to. */
  experienceId: string | null;
  detail: WalkExperienceDetail | null;
  log: string[];

  listPhase: ListPhase;
  /** Whole list, server-sorted `startedAt` DESC. */
  items: WalkExperienceListItem[];

  loadExperience(experienceId: string): Promise<void>;
  loadList(): Promise<void>;
  probeListQuery(query: ListWalkExperiencesQuery): Promise<ListProbeResult>;
  /** Sign-out. These rows belong to the user who just left. */
  reset(): void;
};

/**
 * Module scope, like the diary flow's generate counter: it survives Fast
 * Refresh, and a list request already in flight when the user signs out must
 * not land afterwards and repopulate the archive with the previous user's rows.
 */
let resetRun = 0;

export const useExperiences = create<ExperienceState>((set, get) => {
  const append = (line: string) => {
    console.log(`[MOWA] experience ${line}`);
    set((state) => ({
      log: [`${new Date().toLocaleTimeString()}  ${line}`, ...state.log].slice(0, 40),
    }));
  };

  const ensureToken = async (): Promise<boolean> => {
    if (hasAccessToken()) return true;
    return useWalkCandidateFlow.getState().loginWithEnvCredentials();
  };

  // Module-scope rather than state: a second concurrent fetch would be pure
  // waste, and re-rendering on "a fetch is running" is what listPhase is for.
  let listInFlight = false;

  return {
    phase: 'idle',
    experienceId: null,
    detail: null,
    log: [],

    listPhase: 'idle',
    items: [],

    loadExperience: async (experienceId) => {
      set({ phase: 'loading', experienceId, detail: null });

      // A newer load supersedes this one (fast navigation between details).
      const superseded = () => get().experienceId !== experienceId;

      if (!(await ensureToken())) {
        append('detail: no session');
        if (!superseded()) set({ phase: 'error' });
        return;
      }

      const fetched = await api.getWalkExperience(experienceId);
      if (superseded()) return;

      if (fetched.ok) {
        set({ phase: 'ready', detail: fetched.value });
        return;
      }
      // Spec folds missing, deleted and foreign experiences into one 404.
      if (fetched.status === 404) {
        append(`detail: ${experienceId} not found`);
        set({ phase: 'not-found' });
        return;
      }
      append(`detail: GET FAILED (${fetched.status ?? 'network'}) — ${fetched.error}`);
      set({ phase: 'error' });
    },

    /**
     * Home and the archive both call this on mount. Refetching every time is
     * deliberate: the payload is small, and a cache would go stale the moment
     * the diary flow saves a new experience.
     */
    loadList: async () => {
      if (listInFlight) return;
      listInFlight = true;
      const run = resetRun;
      set({ listPhase: 'loading' });

      try {
        if (!(await ensureToken())) {
          append('list: no session');
          if (run === resetRun) set({ listPhase: 'error' });
          return;
        }

        const fetched = await api.listWalkExperiences();
        // A sign-out during the request wins: these rows are the previous
        // user's and must not reach the archive.
        if (run !== resetRun) {
          append('list: superseded by sign-out');
          return;
        }

        if (fetched.ok) {
          set({ listPhase: 'ready', items: fetched.value });
          return;
        }

        append(`list: GET FAILED (${fetched.status ?? 'network'}) — ${fetched.error}`);
        set({ listPhase: 'error' });
      } finally {
        listInFlight = false;
      }
    },

    /**
     * Runs a raw list query and reports the outcome without disturbing
     * `items`. The product filters client-side, so this is the only place the
     * spec's from/to/tag rules — including its four 400s — get exercised
     * against a server. /debug section 8 is the caller.
     */
    probeListQuery: async (query) => {
      if (!(await ensureToken())) {
        return { status: null, count: null, error: '세션 없음' };
      }

      const fetched = await api.listWalkExperiences(query);
      if (fetched.ok) {
        append(`probe ${JSON.stringify(query)} → 200 (${fetched.value.length}건)`);
        return { status: 200, count: fetched.value.length, error: null };
      }

      append(`probe ${JSON.stringify(query)} → ${fetched.status ?? 'network'} — ${fetched.error}`);
      return { status: fetched.status, count: null, error: fetched.error };
    },

    reset: () => {
      resetRun += 1;
      listInFlight = false;
      set({
        phase: 'idle',
        experienceId: null,
        detail: null,
        listPhase: 'idle',
        items: [],
      });
    },
  };
});
