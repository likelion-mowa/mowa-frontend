import { create } from 'zustand';

import { api, hasAccessToken, type ApiResult } from '@/api/client';
import type {
  ListWalkExperiencesQuery,
  WalkExperienceDetail,
  WalkExperienceListItem,
} from '@/api/types';
import {
  buildExperiencePatch,
  isEmptyPatch,
  listItemFields,
  parseTagsInput,
  validateTitleAndTags,
  type ExperienceEditDraft,
} from '@/lib/experience-input';

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
 *
 * The write side (기능 8) edits and deletes one record. Both keep `detail` and
 * the cached `items` correct WITHOUT re-fetching: home and the archive load the
 * list once per mount, so a stale row would survive until the next cold entry,
 * and whether `router.replace` remounts an already-stacked screen is not
 * something to bet correctness on. See `updateExperience` for why applying the
 * request (rather than the response) is sound.
 */

export type ExperiencePhase = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';
export type ListPhase = 'idle' | 'loading' | 'ready' | 'error';
export type EditPhase = 'idle' | 'saving';
export type DeletePhase = 'idle' | 'deleting';

/**
 * Shaped like auth-store's `signInMessage`. A network failure gets our own
 * copy; anything else surfaces the server's `message`, because the client has
 * no way to know which of 기능 8's ten validation rules fired and the server's
 * Korean text is the only accurate thing to show. 404 never reaches here — it
 * is a state change, not a message.
 */
function writeFailureMessage(failure: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (failure.status === null) return '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.';
  return failure.error;
}

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

  editPhase: EditPhase;
  /** Client-validation or server failure message for the edit step. */
  editError: string | null;
  deletePhase: DeletePhase;
  deleteError: string | null;

  loadExperience(experienceId: string): Promise<void>;
  loadList(): Promise<void>;
  probeListQuery(query: ListWalkExperiencesQuery): Promise<ListProbeResult>;
  /** True when the record now matches the draft — including "nothing changed". */
  updateExperience(experienceId: string, draft: ExperienceEditDraft): Promise<boolean>;
  /** True when the record is gone, which includes it having been gone already. */
  deleteExperience(experienceId: string): Promise<boolean>;
  /** 취소 discards a failed write's message along with its values. */
  clearWriteErrors(): void;
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

    editPhase: 'idle',
    editError: null,
    deletePhase: 'idle',
    deleteError: null,

    loadExperience: async (experienceId) => {
      set({ phase: 'loading', experienceId, detail: null });

      // A newer load supersedes this one (fast navigation between details).
      const superseded = () => get().experienceId !== experienceId;

      if (!hasAccessToken()) {
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
        if (!hasAccessToken()) {
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
      if (!hasAccessToken()) {
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

    /**
     * 기능 8 수정. The draft is the editor's local working copy; only what
     * actually differs from `detail` is sent.
     */
    updateExperience: async (experienceId, draft) => {
      const current = get().detail;
      if (current === null || get().experienceId !== experienceId) {
        append(`edit: ${experienceId} not loaded`);
        set({ editError: '기록을 불러오지 못했어요.' });
        return false;
      }

      const invalid = validateTitleAndTags(draft.title, parseTagsInput(draft.tagsInput));
      if (invalid !== null) {
        set({ editError: invalid });
        return false;
      }

      const patch = buildExperiencePatch(current, draft);
      if (isEmptyPatch(patch)) {
        // The spec does not define an empty PATCH, and a round trip that can
        // only fail is worse than no round trip. The record already matches.
        append('edit: no change, skipped');
        set({ editError: null });
        return true;
      }

      set({ editPhase: 'saving', editError: null });
      const saved = await api.updateWalkExperience(experienceId, patch);

      if (saved.ok) {
        append(`edit: ${experienceId} → 200 (${Object.keys(patch).join(', ')})`);
        set((state) => ({
          editPhase: 'idle',
          editError: null,
          // The patch, not the response: the spec has no response body for this
          // endpoint, and "omit = keep, sent = set" makes the resulting record
          // fully determined by the request. `patch` cannot carry a snapshot
          // column — `UpdateWalkExperienceRequest` has no such key — which is
          // exactly why spreading it over `detail` is safe. Never spread the
          // other way.
          detail:
            state.experienceId === experienceId && state.detail !== null
              ? { ...state.detail, ...patch }
              : state.detail,
          items: state.items.map((item) =>
            item.experienceId === experienceId ? { ...item, ...listItemFields(patch) } : item,
          ),
        }));
        return true;
      }

      // Gone or foreign. The phase guard tears the editor down and the shipped
      // not-found card already says the right thing.
      if (saved.status === 404) {
        append(`edit: ${experienceId} not found`);
        set((state) => ({
          editPhase: 'idle',
          editError: null,
          phase: 'not-found',
          detail: null,
          items: state.items.filter((item) => item.experienceId !== experienceId),
        }));
        return false;
      }

      append(`edit: PATCH FAILED (${saved.status ?? 'network'}) — ${saved.error}`);
      set({ editPhase: 'idle', editError: writeFailureMessage(saved) });
      return false;
    },

    /** 기능 8 삭제. Soft delete server-side; locally the row simply stops existing. */
    deleteExperience: async (experienceId) => {
      set({ deletePhase: 'deleting', deleteError: null });
      const removed = await api.deleteWalkExperience(experienceId);

      // 404 is success: by spec an already-deleted (or never-existing) record
      // answers 404, and the caller's intent — "this must be gone" — holds.
      if (removed.ok || removed.status === 404) {
        append(`delete: ${experienceId} → ${removed.ok ? '200' : '404 (already gone)'}`);
        set((state) => ({
          deletePhase: 'idle',
          deleteError: null,
          items: state.items.filter((item) => item.experienceId !== experienceId),
          // Reset rather than 'not-found': the user deleted this on purpose, so
          // flashing 기록을 찾을 수 없어요 for the frame before the navigation
          // lands would read as an error. The screen paints its neutral spinner
          // instead. Its load effect keys on the ROUTE param, which has not
          // changed, so nothing re-fetches the deleted id.
          ...(state.experienceId === experienceId
            ? { phase: 'idle' as ExperiencePhase, experienceId: null, detail: null }
            : {}),
        }));
        return true;
      }

      append(`delete: DELETE FAILED (${removed.status ?? 'network'}) — ${removed.error}`);
      set({ deletePhase: 'idle', deleteError: writeFailureMessage(removed) });
      return false;
    },

    clearWriteErrors: () => set({ editError: null, deleteError: null }),

    reset: () => {
      resetRun += 1;
      listInFlight = false;
      set({
        phase: 'idle',
        experienceId: null,
        detail: null,
        listPhase: 'idle',
        items: [],
        editPhase: 'idle',
        editError: null,
        deletePhase: 'idle',
        deleteError: null,
      });
    },
  };
});
