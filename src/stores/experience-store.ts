import { create } from 'zustand';

import { api, hasAccessToken } from '@/api/client';
import type { WalkExperienceDetail } from '@/api/types';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * Read side of walk_experiences (기능 7 detail today; the archive list task
 * will extend this store). Screens read this store; only the store talks to
 * the api client.
 */

export type ExperiencePhase = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

type ExperienceState = {
  phase: ExperiencePhase;
  /** The id the current phase/detail belong to. */
  experienceId: string | null;
  detail: WalkExperienceDetail | null;
  log: string[];

  loadExperience(experienceId: string): Promise<void>;
};

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

  return {
    phase: 'idle',
    experienceId: null,
    detail: null,
    log: [],

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
  };
});
