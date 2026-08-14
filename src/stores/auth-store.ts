import { create } from 'zustand';

import { api, hasAccessToken, setAccessToken, setSessionExpiredHandler } from '@/api/client';
import { LIMITS, type LoginRequest, type MeResponse } from '@/api/types';
import type { ApiResult } from '@/api/client';
import { SECURE_KEYS, secureStore } from '@/adapters';
import { useDiaryFlow } from '@/stores/diary-flow-store';
import { useExperiences } from '@/stores/experience-store';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * The session and the signed-in user (기능 13). Grown out of the old
 * profile-store, which said in its own comment that this task would replace it.
 *
 * One store rather than two because logout has to reset the nickname cache
 * anyway, and the spec models 인증 and 마이페이지 as a single feature: three
 * endpoints, one user row, no signup and no refresh token.
 *
 * The root layout is the only navigator here. Screens never redirect on 401 —
 * they just read `status`, and the gate in `_layout.tsx` does the rest.
 */

export type AuthStatus = 'restoring' | 'signed-out' | 'signed-in';

type AuthState = {
  status: AuthStatus;
  /**
   * Null while restoring, after sign-out, and in the one odd case where the
   * session was kept but `/users/me` could not be reached. Callers fall back to
   * neutral copy rather than treating that as an error.
   */
  user: MeResponse | null;

  signInPhase: 'idle' | 'submitting';
  signInError: string | null;
  nicknamePhase: 'idle' | 'saving';
  nicknameError: string | null;
  log: string[];

  restore(): Promise<void>;
  signIn(credentials: LoginRequest): Promise<boolean>;
  signOut(): Promise<void>;
  updateNickname(next: string): Promise<boolean>;
  /** /debug only. The app itself always goes through the login screen. */
  devSignInWithEnvCredentials(): Promise<boolean>;
};

/**
 * Sign-in failure copy, derived from the HTTP status only.
 *
 * `error.code` is never branched on (team decision — see the ApiFailure comment
 * in api/types). The spec names `INVALID_CREDENTIALS` for a bad login and says
 * a missing id and a wrong password are deliberately indistinguishable, so one
 * message covers both.
 */
function signInMessage(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.status === 401) return '아이디 또는 비밀번호를 확인해주세요.';
  if (result.status === null) return '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.';
  return result.error;
}

export const useAuth = create<AuthState>((set, get) => {
  const append = (line: string) => {
    console.log(`[MOWA] auth ${line}`);
    set((state) => ({
      log: [`${new Date().toLocaleTimeString()}  ${line}`, ...state.log].slice(0, 40),
    }));
  };

  /**
   * Everything scoped to the signed-in user. Not `storage.clear()`: the SQLite
   * `walks` table is a device-scoped detection buffer, and a candidate that
   * belongs to another user already resolves to 404 on the server.
   */
  const resetUserScopedStores = () => {
    useWalkCandidateFlow.getState().reset();
    useDiaryFlow.getState().reset();
    useExperiences.getState().reset();
  };

  const clearSession = async (reason: string) => {
    setAccessToken(null);
    const deleted = await secureStore.deleteItem(SECURE_KEYS.authToken);
    if (!deleted.ok) append(`${reason}: token not deleted — ${deleted.error}`);
    resetUserScopedStores();
    set({ status: 'signed-out', user: null, nicknameError: null });
  };

  let restored = false;

  return {
    status: 'restoring',
    user: null,
    signInPhase: 'idle',
    signInError: null,
    nicknamePhase: 'idle',
    nicknameError: null,
    log: [],

    restore: async () => {
      if (restored) return;
      restored = true;

      // Registered here rather than at module scope so the handler exists
      // before the first authenticated request can possibly run.
      setSessionExpiredHandler(() => {
        append('session expired (401) — signing out');
        void clearSession('expire');
      });

      const stored = await secureStore.getItem(SECURE_KEYS.authToken);
      if (!stored.ok) {
        append(`restore: read FAILED — ${stored.error}`);
        set({ status: 'signed-out' });
        return;
      }
      if (stored.value === null) {
        append('restore: no stored token');
        set({ status: 'signed-out' });
        return;
      }

      // Verified, not optimistic: a stored token may have been revoked.
      setAccessToken(stored.value);
      const me = await api.getMe();

      if (me.ok) {
        append(`restore: signed in as ${me.value.loginId}`);
        set({ status: 'signed-in', user: me.value });
        return;
      }

      if (me.status === 401) {
        // The client already discarded the token and fired the handler; this
        // branch only makes the outcome explicit and is idempotent.
        append('restore: stored token rejected');
        await clearSession('restore');
        return;
      }

      // A network error or a 5xx is NOT a session failure. Treating it as one
      // would eject the user every time the backend is down — which is the
      // normal local state (mock not running) and the permanent state of the
      // deployed web build, which has no backend at all.
      append(`restore: /users/me unreachable (${me.status ?? 'network'}) — session kept`);
      set({ status: 'signed-in', user: null });
    },

    signIn: async (credentials) => {
      set({ signInPhase: 'submitting', signInError: null });

      const result = await api.login(credentials);
      if (!result.ok) {
        append(`signIn FAILED (${result.status ?? 'network'}) — ${result.error}`);
        set({ signInPhase: 'idle', signInError: signInMessage(result) });
        return false;
      }

      setAccessToken(result.value.accessToken);
      const saved = await secureStore.setItem(SECURE_KEYS.authToken, result.value.accessToken);
      // A keychain write failure costs persistence, not the session — the user
      // is signed in for this run either way, so it is logged, not surfaced.
      if (!saved.ok) append(`signIn: token not persisted — ${saved.error}`);

      const me = await api.getMe();
      if (!me.ok) append(`signIn: /users/me FAILED (${me.status ?? 'network'}) — ${me.error}`);

      append(`signIn ok as ${credentials.loginId}`);
      set({
        status: 'signed-in',
        user: me.ok ? me.value : null,
        signInPhase: 'idle',
        signInError: null,
      });
      return true;
    },

    signOut: async () => {
      append('signOut');
      await clearSession('signOut');
      set({ signInError: null });
    },

    updateNickname: async (next) => {
      const trimmed = next.trim();
      if (trimmed.length === 0) {
        set({ nicknameError: '닉네임을 입력해주세요.' });
        return false;
      }
      if (trimmed.length > LIMITS.nicknameMaxLength) {
        set({ nicknameError: `닉네임은 ${LIMITS.nicknameMaxLength}자까지 쓸 수 있어요.` });
        return false;
      }
      if (!hasAccessToken()) {
        set({ nicknameError: '로그인 상태를 확인할 수 없어요.' });
        return false;
      }

      set({ nicknamePhase: 'saving', nicknameError: null });
      const result = await api.updateMe({ nickname: trimmed });
      if (!result.ok) {
        append(`updateNickname FAILED (${result.status ?? 'network'}) — ${result.error}`);
        set({ nicknamePhase: 'idle', nicknameError: '닉네임을 저장하지 못했어요.' });
        return false;
      }

      append(`updateNickname ok — ${result.value.nickname}`);
      set({ nicknamePhase: 'idle', user: result.value, nicknameError: null });
      return true;
    },

    devSignInWithEnvCredentials: async () => {
      const loginId = process.env.EXPO_PUBLIC_MOCK_LOGIN_ID;
      const password = process.env.EXPO_PUBLIC_MOCK_PASSWORD;
      if (!loginId || !password) {
        append('dev login skipped — EXPO_PUBLIC_MOCK_LOGIN_ID/PASSWORD not set');
        return false;
      }
      return get().signIn({ loginId, password });
    },
  };
});
