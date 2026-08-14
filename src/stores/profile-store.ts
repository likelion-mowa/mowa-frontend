import { create } from 'zustand';

import { api, hasAccessToken } from '@/api/client';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * The signed-in user (기능 4). Only the archive header needs it today — it
 * greets by nickname — but this is the store the login screen and token
 * persistence task will grow into, so it starts as its own domain rather than
 * a field on the experience store.
 *
 * A missing nickname is never an error worth showing: the archive falls back to
 * a neutral title.
 */

type ProfileState = {
  nickname: string | null;
  loadProfile(): Promise<void>;
};

export const useProfile = create<ProfileState>((set, get) => {
  let inFlight = false;

  const ensureToken = async (): Promise<boolean> => {
    if (hasAccessToken()) return true;
    return useWalkCandidateFlow.getState().loginWithEnvCredentials();
  };

  return {
    nickname: null,

    loadProfile: async () => {
      if (inFlight || get().nickname !== null) return;
      inFlight = true;

      try {
        if (!(await ensureToken())) {
          console.log('[MOWA] profile: no session, skipping GET /users/me');
          return;
        }

        const fetched = await api.getMe();
        if (fetched.ok) {
          set({ nickname: fetched.value.nickname });
          return;
        }
        console.log(
          `[MOWA] profile: GET FAILED (${fetched.status ?? 'network'}) — ${fetched.error}`,
        );
      } finally {
        inFlight = false;
      }
    },
  };
});
