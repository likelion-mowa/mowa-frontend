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
  type ApiEnvelope,
  type CreateWalkCandidateRequest,
  type LoginRequest,
  type LoginResponse,
  type UpdateWalkCandidateRequest,
  type Uuid,
  type WalkCandidate,
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

async function requestJson<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
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
    return requestJson<LoginResponse>('POST', endpoints.login(), credentials);
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
};
