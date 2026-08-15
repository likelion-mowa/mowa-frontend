import { create } from 'zustand';

import { photoPicker } from '@/adapters';
import { api, hasAccessToken } from '@/api/client';
import {
  normalizeTag,
  type Companion,
  type CreateExperienceDraftRequest,
  type CreateWalkExperienceRequest,
  type Emotion,
  type Situation,
  type UpdateExperienceDraftRequest,
} from '@/api/types';
import {
  parseTagsInput,
  releasePhotoUri,
  validateTitleAndTags,
} from '@/lib/experience-input';
import type { ActiveCandidate } from '@/stores/walk-candidate-store';

/**
 * The diary flow (기능 2~5): photo → context → AI generation → preview/edit →
 * finalize. Starts where /walk's 남기기 leaves the candidate at RECORDING.
 *
 * Server shape it drives (docs/backend/api-spec.md):
 * - one draft per candidate, created lazily on the first generate();
 * - ai-generation retried manually from FAILED, never from SUCCESS;
 * - after SUCCESS the draft is immutable, so later user edits (title, body,
 *   tags, and even companion/emotions/situation) ride on the final
 *   `POST /walk-experiences`, which snapshots the confirmed values — that is
 *   the spec's own design, not a shortcut;
 * - cancelling the flow simply never calls the finalize endpoint.
 *
 * Screens read this store; only the store talks to the api client. Same
 * logging discipline as walk-candidate-store: every skipped or failed path is
 * appended, mirrored to the console.
 */

export type DiaryWalkInfo = {
  candidateId: string;
  startedAtMs: number;
  endedAtMs: number | null;
  durationSeconds: number | null;
  locationSummary: string | null;
};

export type GenerationPhase = 'idle' | 'working' | 'failed' | 'success';
export type SavePhase = 'idle' | 'saving' | 'saved';

export type AiResult = {
  title: string;
  body: string;
  suggestedTags: string[];
};

type DiaryFlowState = {
  walk: DiaryWalkInfo | null;

  photoUri: string | null;
  companion: Companion | null;
  emotions: Emotion[];
  situation: Situation | null;

  draftId: string | null;
  generationPhase: GenerationPhase;
  ai: AiResult | null;

  /** Final values the user confirms. Initialized from `ai` on SUCCESS. */
  title: string;
  body: string;
  tags: string[];

  savePhase: SavePhase;
  /** Client-validation or server failure message for the save step. */
  saveError: string | null;
  experienceId: string | null;

  /** Dev-only: makes generate() hit the mock's `?fail=1` switch (/debug toggle). */
  forceAiFailure: boolean;

  log: string[];

  beginFlow(candidate: ActiveCandidate): void;
  pickPhotoFromLibrary(): Promise<void>;
  capturePhotoWithCamera(): Promise<void>;
  setPhoto(uri: string | null): void;
  setCompanion(value: Companion | null): void;
  toggleEmotion(value: Emotion): void;
  setSituation(value: Situation | null): void;
  generate(): Promise<void>;
  /**
   * Validates the edited values FIRST and commits them to the store only when
   * they pass — a failed save must not leak half-valid values into the
   * preview (취소 discards everything, as the edit screen promises).
   */
  applyEditAndSave(edit: { title: string; body: string; tagsInput: string }): Promise<boolean>;
  /** Returns true when the experience was created (or already exists). */
  save(): Promise<boolean>;
  /** 취소 discards a failed edit's error along with its values. */
  clearSaveError(): void;
  setForceAiFailure(value: boolean): void;
  reset(): void;
};

/** The mock answers instantly; a loading screen that flashes reads as broken. */
const MIN_GENERATION_MS = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Key of the inputs the server draft was last synced with. */
function inputsKey(state: Pick<DiaryFlowState, 'photoUri' | 'companion' | 'emotions' | 'situation'>): string {
  return JSON.stringify([state.photoUri, state.companion, [...state.emotions].sort(), state.situation]);
}

/** Fields the user actually set. Unset fields are omitted — the spec forbids the server inventing them. */
function draftBody(state: DiaryFlowState): CreateExperienceDraftRequest {
  const body: CreateExperienceDraftRequest = {};
  if (state.photoUri !== null) body.photoUrl = state.photoUri;
  if (state.companion !== null) body.companion = state.companion;
  if (state.emotions.length > 0) body.emotions = state.emotions;
  if (state.situation !== null) body.situation = state.situation;
  return body;
}

const initial = {
  walk: null,
  photoUri: null,
  companion: null,
  emotions: [] as Emotion[],
  situation: null,
  draftId: null,
  generationPhase: 'idle' as GenerationPhase,
  ai: null,
  title: '',
  body: '',
  tags: [] as string[],
  savePhase: 'idle' as SavePhase,
  saveError: null,
  experienceId: null,
};

// Module scope, like walk-candidate-store's run counter: survives Fast Refresh
// and lets a newer generate() supersede one still in flight.
let generateRun = 0;
let syncedInputsKey: string | null = null;

export const useDiaryFlow = create<DiaryFlowState>((set, get) => {
  const append = (line: string) => {
    console.log(`[MOWA] diary ${line}`);
    set((state) => ({
      log: [`${new Date().toLocaleTimeString()}  ${line}`, ...state.log].slice(0, 40),
    }));
  };

  return {
    ...initial,
    forceAiFailure: false,
    log: [],

    beginFlow: (candidate) => {
      if (get().walk?.candidateId === candidate.candidateId) return; // remount of the same flow
      generateRun += 1;
      syncedInputsKey = null;
      releasePhotoUri(get().photoUri);
      set({
        ...initial,
        walk: {
          candidateId: candidate.candidateId,
          startedAtMs: candidate.startedAtMs,
          endedAtMs: candidate.endedAtMs,
          durationSeconds: candidate.durationSeconds,
          locationSummary: candidate.locationSummary,
        },
      });
      append(`flow started for candidate ${candidate.candidateId}`);
    },

    pickPhotoFromLibrary: async () => {
      const picked = await photoPicker.pickFromLibrary();
      if (!picked.ok) {
        append(`photo library FAILED — ${picked.error}`);
        return;
      }
      if (picked.value === null) {
        append('photo library cancelled');
        return;
      }
      releasePhotoUri(get().photoUri);
      set({ photoUri: picked.value.uri });
    },

    capturePhotoWithCamera: async () => {
      const captured = await photoPicker.captureWithCamera();
      if (!captured.ok) {
        append(`camera FAILED — ${captured.error}`);
        return;
      }
      if (captured.value === null) {
        append('camera cancelled');
        return;
      }
      releasePhotoUri(get().photoUri);
      set({ photoUri: captured.value.uri });
    },

    setPhoto: (uri) => {
      const previous = get().photoUri;
      if (previous !== uri) releasePhotoUri(previous);
      set({ photoUri: uri });
    },
    setCompanion: (value) => set({ companion: value }),
    setSituation: (value) => set({ situation: value }),

    // Multi-select per spec (emotions[]); the prototype's single-select is a
    // prototype limitation — its own copy says "여러 개를 선택해도 괜찮아요".
    toggleEmotion: (value) =>
      set((state) => ({
        emotions: state.emotions.includes(value)
          ? state.emotions.filter((emotion) => emotion !== value)
          : [...state.emotions, value],
      })),

    generate: async () => {
      const state = get();
      if (state.walk === null) {
        append('generate skipped — no active flow');
        return;
      }
      // Coming back from preview re-mounts the loading screen; nothing to redo.
      if (state.generationPhase === 'success' || state.generationPhase === 'working') return;

      const run = ++generateRun;
      const superseded = () => run !== generateRun;
      const startedAt = Date.now();
      set({ generationPhase: 'working' });

      /** Holds the loading screen up long enough to register, then settles. */
      const settle = async (next: Partial<DiaryFlowState>) => {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_GENERATION_MS) await sleep(MIN_GENERATION_MS - elapsed);
        if (!superseded()) set(next);
      };

      const fail = async (line: string) => {
        append(line);
        await settle({ generationPhase: 'failed' });
      };

      if (!hasAccessToken()) {
        await fail('generate: no session');
        return;
      }
      if (superseded()) return;

      let draftId = state.draftId;
      const currentKey = inputsKey(state);

      if (draftId === null) {
        const created = await api.createExperienceDraft(state.walk.candidateId, draftBody(state));
        if (superseded()) return;
        if (!created.ok) {
          await fail(`generate: draft POST FAILED (${created.status ?? 'network'}) — ${created.error}`);
          return;
        }
        draftId = created.value.draftId;
        syncedInputsKey = currentKey;
        set({ draftId });
        append(`draft created ${draftId}`);
      } else if (syncedInputsKey !== currentKey) {
        // Inputs changed after a FAILED round. PATCH sends the full current
        // truth: null clears a scalar, the array replaces wholesale.
        const patch: UpdateExperienceDraftRequest = {
          photoUrl: state.photoUri,
          companion: state.companion,
          emotions: state.emotions,
          situation: state.situation,
        };
        const updated = await api.updateExperienceDraft(draftId, patch);
        if (superseded()) return;
        if (!updated.ok) {
          await fail(`generate: draft PATCH FAILED (${updated.status ?? 'network'}) — ${updated.error}`);
          return;
        }
        syncedInputsKey = currentKey;
        append('draft inputs updated');
      }

      const forceFail = get().forceAiFailure;
      if (forceFail) append('generate: forceAiFailure is ON (dev toggle) — sending ?fail=1');
      const generated = await api.generateAiDiary(draftId, forceFail ? { forceFail } : undefined);
      if (superseded()) return;
      if (!generated.ok) {
        await fail(`generate: ai-generation FAILED (${generated.status ?? 'network'}) — ${generated.error}`);
        return;
      }

      // Internal whitespace is collapsed (생각에 잠긴 → 생각에잠긴): the edit
      // screen separates tags BY spaces, so a tag containing one could never
      // round-trip. The spec's own suggestedTags example uses this exact form.
      const tags = generated.value.suggestedTags
        .map((raw) => normalizeTag(raw.replace(/\s+/g, '')))
        .filter((tag): tag is string => tag !== null);
      append(`generate: SUCCESS "${generated.value.aiTitle}"`);
      await settle({
        generationPhase: 'success',
        ai: {
          title: generated.value.aiTitle,
          body: generated.value.aiBody,
          suggestedTags: generated.value.suggestedTags,
        },
        title: generated.value.aiTitle,
        body: generated.value.aiBody,
        tags: [...new Set(tags)],
      });
    },

    applyEditAndSave: async ({ title, body, tagsInput }) => {
      const tags = parseTagsInput(tagsInput);
      const invalid = validateTitleAndTags(title, tags);
      if (invalid !== null) {
        // Store untouched: a failed save must not leak these values into the
        // preview, where 취소 would otherwise show them as if confirmed.
        set({ saveError: invalid });
        return false;
      }
      set({ title, body, tags, saveError: null });
      return get().save();
    },

    save: async () => {
      const state = get();
      if (state.experienceId !== null) return true; // double-tap after success
      if (state.savePhase === 'saving') return false;
      if (state.walk === null || state.draftId === null || state.generationPhase !== 'success') {
        append('save skipped — flow is not in a saveable state');
        return false;
      }

      const title = state.title.trim();
      const invalid = validateTitleAndTags(title, state.tags);
      if (invalid !== null) {
        set({ saveError: invalid });
        return false;
      }

      set({ savePhase: 'saving', saveError: null });
      const fail = (line: string, message: string) => {
        append(line);
        set({ savePhase: 'idle', saveError: message });
        return false;
      };

      if (!hasAccessToken()) return fail('save: no session', '로그인 상태를 확인할 수 없어요.');

      const body: CreateWalkExperienceRequest = { draftId: state.draftId, title };
      const trimmedBody = state.body.trim();
      if (trimmedBody.length > 0) body.body = trimmedBody;
      if (state.photoUri !== null) body.photoUrl = state.photoUri;
      if (state.companion !== null) body.companion = state.companion;
      if (state.emotions.length > 0) body.emotions = state.emotions;
      if (state.situation !== null) body.situation = state.situation;
      if (state.tags.length > 0) body.tags = state.tags;

      const created = await api.createWalkExperience(body);
      if (!created.ok) {
        // 409 = this draft was already finalized — cannot recover the id here
        // (the list endpoint is a later task), so it is reported, not hidden.
        return fail(
          `save: POST FAILED (${created.status ?? 'network'}) — ${created.error}`,
          '저장에 실패했어요. 잠시 후 다시 시도해주세요.',
        );
      }

      append(`save: experience created ${created.value.experienceId}`);
      set({ savePhase: 'saved', experienceId: created.value.experienceId });
      return true;
    },

    clearSaveError: () => set({ saveError: null }),

    setForceAiFailure: (value) => {
      append(`forceAiFailure ${value ? 'ON' : 'OFF'} (dev toggle)`);
      set({ forceAiFailure: value });
    },

    reset: () => {
      generateRun += 1;
      syncedInputsKey = null;
      set({ ...initial });
    },
  };
});
