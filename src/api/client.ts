/**
 * HTTP client for the MOWA backend (`docs/backend/api-spec.md`).
 *
 * Pure fetch and platform-free — safe in the web bundle and on iOS alike, so
 * this is NOT an adapter pair; there is exactly one implementation.
 *
 * Error policy (team decision 2026-08-12): callers branch on the HTTP status
 * only. `error.code` has no agreed vocabulary yet and is logged, never
 * branched on — see the `ApiFailure` comment in ./types.
 */
import {
  endpoints,
  isValidListQuery,
  type AiGenerationResponse,
  type ApiEnvelope,
  type CreateExperienceDraftRequest,
  type CreateWalkCandidateRequest,
  type CreateWalkExperienceRequest,
  type CreateWalkExperienceResponse,
  type ExperienceDraft,
  type ListWalkExperiencesQuery,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type UpdateExperienceDraftRequest,
  type UpdateMeRequest,
  type UpdateWalkCandidateRequest,
  type Uuid,
  type WalkCandidate,
  type WalkExperienceDetail,
  type WalkExperienceListItem,
} from './types';

/**
 * Like AdapterResult, plus the HTTP status the failure came with.
 * `status: null` means the request never reached the backend (network error).
 */
export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number | null; error: string };

/**
 * EXPO_PUBLIC_* is inlined at build time. The deployed web build must NOT set
 * this: the mock is local-only (mock/README.md), and against the localhost
 * default a judge's browser fails loudly in the console instead of silently
 * reading someone else's machine.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

let accessToken: string | null = null;

/** MVP has no refresh token; logout is simply `setAccessToken(null)`. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

let sessionExpiredHandler: (() => void) | null = null;

/**
 * Called once, by the auth store, when a request fails with 401 while a token
 * was set. Registered rather than imported so this file keeps knowing nothing
 * about stores or navigation — the redirect is a consequence of auth state, not
 * something any screen handles.
 */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

type RequestOptions = {
  /**
   * Endpoints that need no token. Only `/auth/login` today, and it matters: a
   * 401 there means wrong credentials, not an expired session, and must not
   * eject the user who is currently typing them.
   */
  public?: boolean;
};

async function requestJson<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      // The candidate GET reads a status machine, so a stale cache hit would
      // show the wrong screen. Honest scope: this holds on web, and React
      // Native appears to ignore it — the device still issued conditional GETs
      // on 2026-08-14. That turned out to be harmless: iOS revalidates and
      // hands the app the fresh body, and the transitions that followed a 304
      // went through.
      cache: 'no-store',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(`[MOWA] api ${method} ${path} network error — ${message}`);
    return { ok: false, status: null, error: message };
  }

  // A proxy or crash page may not return JSON; that is a failure value here,
  // never a throw.
  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || envelope === null || !envelope.success) {
    const logDetail =
      envelope === null
        ? 'non-JSON body'
        : envelope.success
          ? envelope.message
          : `${envelope.error.code}: ${envelope.error.detail}`;
    console.log(`[MOWA] api ${method} ${path} → ${response.status} — ${logDetail}`);

    // Session expiry, handled in exactly one place. The spec defines no token
    // TTL and no refresh (docs/backend/api-spec.md 기능 13), so a 401 on an
    // authenticated call is terminal for the session: discard the token here,
    // or `hasAccessToken()` keeps returning true and every later request 401s
    // forever with no recovery but an app restart.
    if (response.status === 401 && options?.public !== true) {
      // Only the request that actually had a token reports the expiry. This
      // makes N concurrent 401s notify once (the first nulls the token, the
      // rest read false), and stops a tokenless 401 from ejecting someone who
      // is already signed out.
      const hadToken = accessToken !== null;
      accessToken = null;
      if (hadToken) sessionExpiredHandler?.();
    }

    return {
      ok: false,
      status: response.status,
      error: envelope?.message ?? `HTTP ${response.status}`,
    };
  }

  return { ok: true, value: envelope.data };
}

export const api = {
  login(credentials: LoginRequest): Promise<ApiResult<LoginResponse>> {
    // `public` is a flag, not a path comparison: `generateAiDiary` already
    // appends `?fail=1` to a path, so paths are not stable identifiers here.
    return requestJson<LoginResponse>('POST', endpoints.login(), credentials, { public: true });
  },

  createWalkCandidate(body: CreateWalkCandidateRequest): Promise<ApiResult<WalkCandidate>> {
    return requestJson<WalkCandidate>('POST', endpoints.walkCandidates(), body);
  },

  /**
   * The suggestion screen re-reads the candidate on entry: a notification can
   * be tapped long after the walk was already kept or skipped, and the server
   * status is the only way to tell (there is no list endpoint to reconcile
   * against — docs/api-implementation.md 공백 1).
   */
  getWalkCandidate(candidateId: Uuid): Promise<ApiResult<WalkCandidate>> {
    return requestJson<WalkCandidate>('GET', endpoints.walkCandidate(candidateId));
  },

  /** Callers live in walk-candidate-store: end values on detection, then the
   * SUGGESTED / RECORDING / SKIPPED transitions the suggestion screen drives. */
  updateWalkCandidate(
    candidateId: Uuid,
    body: UpdateWalkCandidateRequest,
  ): Promise<ApiResult<WalkCandidate>> {
    return requestJson<WalkCandidate>('PATCH', endpoints.walkCandidate(candidateId), body);
  },

  /** Requires the candidate to be RECORDING; one draft per candidate (FK+UNIQUE). */
  createExperienceDraft(
    candidateId: Uuid,
    body: CreateExperienceDraftRequest,
  ): Promise<ApiResult<ExperienceDraft>> {
    return requestJson<ExperienceDraft>('POST', endpoints.experienceDrafts(candidateId), body);
  },

  /** Allowed only while the draft is PENDING or FAILED. */
  updateExperienceDraft(
    draftId: Uuid,
    body: UpdateExperienceDraftRequest,
  ): Promise<ApiResult<ExperienceDraft>> {
    return requestJson<ExperienceDraft>('PATCH', endpoints.experienceDraft(draftId), body);
  },

  /**
   * Bodyless by spec — the server reads the draft and candidate itself.
   * `forceFail` is a dev-only hook for the mock's `?fail=1` switch (the only
   * way to exercise the FAILED branch in-app); product code never sets it.
   */
  generateAiDiary(
    draftId: Uuid,
    options?: { forceFail?: boolean },
  ): Promise<ApiResult<AiGenerationResponse>> {
    const suffix = options?.forceFail ? '?fail=1' : '';
    return requestJson<AiGenerationResponse>('POST', `${endpoints.aiGeneration(draftId)}${suffix}`);
  },

  /** Finalize (기능 5). Draft must be SUCCESS; a second call for the same draft is 409. */
  createWalkExperience(
    body: CreateWalkExperienceRequest,
  ): Promise<ApiResult<CreateWalkExperienceResponse>> {
    return requestJson<CreateWalkExperienceResponse>('POST', endpoints.walkExperiences(), body);
  },

  /** Detail (기능 7). Missing, deleted and foreign experiences are all 404. */
  getWalkExperience(experienceId: Uuid): Promise<ApiResult<WalkExperienceDetail>> {
    return requestJson<WalkExperienceDetail>('GET', endpoints.walkExperience(experienceId));
  },

  /**
   * Archive list (기능 6·12). Server-sorted `startedAt` DESC, no pagination in
   * the MVP.
   *
   * The spec rejects `from` without `to`, a reversed range, and any mix of a
   * range with a tag — all four are 400s. `isValidListQuery` mirrors those
   * rules, so an invalid combination fails here instead of costing a round
   * trip. The failure is shaped like a server 400 on purpose: callers already
   * branch on status.
   */
  listWalkExperiences(
    query: ListWalkExperiencesQuery = {},
  ): Promise<ApiResult<WalkExperienceListItem[]>> {
    if (!isValidListQuery(query)) {
      return Promise.resolve({
        ok: false,
        status: 400,
        error: 'from과 to는 함께 전달해야 하고, 기간과 tag는 함께 사용할 수 없습니다.',
      });
    }

    // requestJson takes a path, so the querystring is the caller's job.
    // encodeURIComponent matters: tags are Korean.
    const params = Object.entries(query)
      .filter((entry): entry is [string, string] => entry[1] != null)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
    const suffix = params.length === 0 ? '' : `?${params.join('&')}`;

    return requestJson<WalkExperienceListItem[]>('GET', `${endpoints.walkExperiences()}${suffix}`);
  },

  /** Profile (기능 13) — the archive header greets the user by nickname. */
  getMe(): Promise<ApiResult<MeResponse>> {
    return requestJson<MeResponse>('GET', endpoints.me());
  },

  /**
   * 기능 13 — the nickname is the only editable field in the MVP (profile
   * image, password change and account deletion are all excluded by the spec).
   * The spec names no response body; the mock returns the full MeResponse and
   * that is what the store consumes.
   */
  updateMe(body: UpdateMeRequest): Promise<ApiResult<MeResponse>> {
    return requestJson<MeResponse>('PATCH', endpoints.me(), body);
  },
};
