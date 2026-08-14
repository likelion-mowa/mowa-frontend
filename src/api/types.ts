/**
 * Backend contract for the MOWA API.
 *
 * Source of truth is `docs/backend/` — `api-spec.md`, `erd.md`, `data-tables.md`
 * and `design-changes-2026-08-10.md`. Nothing in this file is invented: every
 * code value, field name, length limit and nullability below is transcribed
 * from those documents. If the backend changes, edit the docs and this file
 * together, and tell the backend owner before renaming any field.
 *
 * This file is platform-free — it imports nothing and holds no native code, so
 * it is safe in the web bundle and on iOS alike.
 *
 * Conventions fixed by the spec:
 * - Base URL is `/api/v1`, JSON fields are camelCase.
 * - Timestamps are TIMESTAMPTZ and travel as ISO 8601 *with offset*.
 * - Calendar dates are `YYYY-MM-DD` and are interpreted in Asia/Seoul.
 * - `userId` is never sent by the client; the server derives it from the token.
 */

/** ISO 8601 instant with offset, e.g. `2026-08-12T13:00:00+09:00`. */
export type IsoDateTime = string;

/** Calendar date, `YYYY-MM-DD`, interpreted in Asia/Seoul. */
export type IsoDate = string;

/** Server-generated UUID. */
export type Uuid = string;

// ---------------------------------------------------------------------------
// Code values
//
// Declared as `as const` arrays rather than TS enums so the allowed set exists
// at runtime — the union types below are derived from the arrays, which makes
// it impossible for the list and the type to drift apart.
// ---------------------------------------------------------------------------

export const COMPANIONS = ['ALONE', 'WITH_SOMEONE', 'PET'] as const;
export type Companion = (typeof COMPANIONS)[number];

export const EMOTIONS = ['CALM', 'HAPPY', 'TIRED', 'REFRESHED', 'PENSIVE'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const SITUATIONS = ['MORNING', 'AFTERNOON', 'EVENING', 'IN_TRANSIT', 'EXPLORING'] as const;
export type Situation = (typeof SITUATIONS)[number];

export const CANDIDATE_STATUSES = ['DETECTED', 'SUGGESTED', 'RECORDING', 'SKIPPED'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const AI_GENERATION_STATUSES = ['PENDING', 'GENERATING', 'SUCCESS', 'FAILED'] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];

/**
 * Korean display strings, transcribed verbatim from the `화면 표시` column of
 * `docs/backend/api-spec.md` §3. These are the team's copy, not ours — do not
 * reword them here. Screens should read from these maps so a single edit to the
 * spec propagates everywhere.
 */
export const COMPANION_LABELS: Record<Companion, string> = {
  ALONE: '혼자',
  WITH_SOMEONE: '누군가와',
  PET: '반려동물과',
};

export const EMOTION_LABELS: Record<Emotion, string> = {
  CALM: '차분한',
  HAPPY: '행복한',
  TIRED: '피곤한',
  REFRESHED: '상쾌한',
  PENSIVE: '생각에 잠긴',
};

export const SITUATION_LABELS: Record<Situation, string> = {
  MORNING: '아침',
  AFTERNOON: '오후',
  EVENING: '저녁',
  IN_TRANSIT: '이동 중',
  EXPLORING: '탐험',
};

// ---------------------------------------------------------------------------
// Validation limits
//
// The server enforces all of these. They are mirrored here so the client can
// fail early with a useful message instead of round-tripping a 400.
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** `walk_experiences.title` VARCHAR(100) NOT NULL. */
  titleMaxLength: 100,
  /** `walk_experience_tags.tag` VARCHAR(50). */
  tagMaxLength: 50,
  /** Application-layer cap, not a DB constraint. */
  tagsMaxCount: 10,
  /** `users.login_id` VARCHAR(50). */
  loginIdMaxLength: 50,
  /** `users.nickname` VARCHAR(30). */
  nicknameMaxLength: 30,
  /** `location_summary` VARCHAR(255). */
  locationSummaryMaxLength: 255,
} as const;

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiFailure = {
  success: false;
  message: string;
  error: {
    /**
     * NOT a contract yet — do not branch on this.
     *
     * The spec names exactly one code (`INVALID_CREDENTIALS`, on login) and
     * leaves the rest as a placeholder, so no agreed vocabulary exists. Branch
     * on the HTTP status instead: the spec does pin 401, 404, 409 and the 400
     * returned for bad list-query combinations.
     *
     * A `switch` on this string would fall through to `default` against a real
     * backend that chose different names — wrong UI, no error, nothing to
     * notice. That silence is why this stays `string` instead of a union.
     *
     * When the backend publishes its list, add it here as an `as const` array
     * plus a union, exactly like the code values above, and have the mock
     * import it. Splitting it later is cheap; depending on it now is not.
     */
    code: string;
    /** Human-readable. Safe to log; not stable enough to assert on. */
    detail: string;
  };
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

// ---------------------------------------------------------------------------
// 기능 13 — 인증 및 마이페이지
// ---------------------------------------------------------------------------

export type LoginRequest = {
  loginId: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
};

export type MeResponse = {
  userId: Uuid;
  loginId: string;
  nickname: string;
};

/** MVP allows editing the nickname only. */
export type UpdateMeRequest = {
  nickname: string;
};

// ---------------------------------------------------------------------------
// 기능 1 — 산책 후보 (walk_candidates)
//
// Walk detection itself is client-side. The server only stores the result and
// owns the status machine: DETECTED → SUGGESTED → RECORDING | SKIPPED.
// ---------------------------------------------------------------------------

export type CreateWalkCandidateRequest = {
  detectedStartAt: IsoDateTime;
  /** Optional. Reverse-geocoded summary such as `망원동`. */
  locationSummary?: string | null;
};

export type WalkCandidate = {
  candidateId: Uuid;
  detectedStartAt: IsoDateTime;
  detectedEndAt: IsoDateTime | null;
  durationSeconds: number | null;
  locationSummary: string | null;
  status: CandidateStatus;
};

/**
 * PATCH sends only the fields being changed. An omitted key means "leave as is";
 * it does not mean null.
 */
export type UpdateWalkCandidateRequest = {
  detectedEndAt?: IsoDateTime;
  durationSeconds?: number;
  locationSummary?: string | null;
  status?: CandidateStatus;
};

// ---------------------------------------------------------------------------
// 기능 2 — 경험 초안 (experience_drafts)
//
// Every user input is optional. `note` was removed by the 8/10 design change —
// see docs/backend/design-changes-2026-08-10.md §6. Do not add it back.
// ---------------------------------------------------------------------------

export type CreateExperienceDraftRequest = {
  photoUrl?: string | null;
  companion?: Companion | null;
  /** Multi-select. Duplicates within the array are rejected by the server. */
  emotions?: Emotion[];
  situation?: Situation | null;
};

export type ExperienceDraft = {
  draftId: Uuid;
  candidateId: Uuid;
  photoUrl: string | null;
  companion: Companion | null;
  emotions: Emotion[];
  situation: Situation | null;
  aiGenerationStatus: AiGenerationStatus;
};

/**
 * Editing is allowed only while `aiGenerationStatus` is `PENDING` or `FAILED`.
 *
 * Two distinct PATCH semantics apply here:
 * - Scalars: omit to keep, send `null` to clear.
 * - `emotions`: omit to keep, `[]` to clear all, a list to REPLACE wholesale.
 *   There is no partial add/remove endpoint.
 */
export type UpdateExperienceDraftRequest = {
  photoUrl?: string | null;
  companion?: Companion | null;
  emotions?: Emotion[];
  situation?: Situation | null;
};

// ---------------------------------------------------------------------------
// 기능 4 — AI 일기 생성
//
// The request has no body: the server reads the draft and its candidate itself.
// ---------------------------------------------------------------------------

export type AiGenerationResponse = {
  draftId: Uuid;
  aiTitle: string;
  aiBody: string;
  /**
   * AI's initial suggestions. NOT persisted by the backend — the user edits
   * these and the confirmed list is sent as `tags` on the final experience.
   */
  suggestedTags: string[];
  aiGenerationStatus: AiGenerationStatus;
};

// ---------------------------------------------------------------------------
// 기능 5·7 — 산책 경험 (walk_experiences)
//
// Time and place are snapshotted from the candidate by the server; the client
// never sends them. They are also not editable afterwards.
// ---------------------------------------------------------------------------

export type CreateWalkExperienceRequest = {
  draftId: Uuid;
  /** Required, non-empty, max 100 characters. */
  title: string;
  body?: string | null;
  photoUrl?: string | null;
  companion?: Companion | null;
  emotions?: Emotion[];
  situation?: Situation | null;
  /** Max 10, each max 50 characters, stored without a leading `#`. */
  tags?: string[];
};

export type CreateWalkExperienceResponse = {
  experienceId: Uuid;
  draftId: Uuid;
  createdAt: IsoDateTime;
};

/** Row shape returned by the list endpoint (기능 6). */
export type WalkExperienceListItem = {
  experienceId: Uuid;
  photoUrl: string | null;
  title: string;
  startedAt: IsoDateTime;
  locationSummary: string | null;
  companion: Companion | null;
  emotions: Emotion[];
  situation: Situation | null;
  tags: string[];
  /**
   * NOT in the spec today — requested of the backend, see
   * docs/api-implementation.md. The archive's 누적 시간 stat and the calendar's
   * per-day minutes need a duration per row, and the list response carries
   * none; fetching every detail to add it up is not worth the round trips.
   * Optional so the UI degrades to "—" until the field ships.
   */
  durationSeconds?: number;
};

/** Full shape returned by the detail endpoint (기능 7). */
export type WalkExperienceDetail = {
  experienceId: Uuid;
  title: string;
  body: string | null;
  photoUrl: string | null;
  startedAt: IsoDateTime;
  endedAt: IsoDateTime;
  durationSeconds: number;
  locationSummary: string | null;
  companion: Companion | null;
  emotions: Emotion[];
  situation: Situation | null;
  tags: string[];
};

/**
 * `title` may not be cleared. `startedAt`, `endedAt`, `durationSeconds` and
 * `locationSummary` are outside the MVP edit scope and are absent by design.
 * `emotions` and `tags` replace wholesale, exactly as on the draft.
 */
export type UpdateWalkExperienceRequest = {
  title?: string;
  body?: string | null;
  photoUrl?: string | null;
  companion?: Companion | null;
  emotions?: Emotion[];
  situation?: Situation | null;
  tags?: string[];
};

/**
 * List filters. The spec forbids combining a date range with a tag, and
 * requires `from` and `to` to be supplied together — see `isValidListQuery`.
 */
export type ListWalkExperiencesQuery = {
  from?: IsoDate;
  to?: IsoDate;
  tag?: string;
};

// ---------------------------------------------------------------------------
// Endpoints
//
// Paths are relative to the base URL. Centralised so a typo cannot hide in a
// call site, and so a backend rename has exactly one place to land.
// ---------------------------------------------------------------------------

export const API_BASE_PATH = '/api/v1';

export const endpoints = {
  login: () => '/auth/login',
  me: () => '/users/me',

  walkCandidates: () => '/walk-candidates',
  walkCandidate: (candidateId: Uuid) => `/walk-candidates/${candidateId}`,

  experienceDrafts: (candidateId: Uuid) => `/walk-candidates/${candidateId}/experience-drafts`,
  experienceDraft: (draftId: Uuid) => `/experience-drafts/${draftId}`,
  aiGeneration: (draftId: Uuid) => `/experience-drafts/${draftId}/ai-generation`,

  walkExperiences: () => '/walk-experiences',
  walkExperience: (experienceId: Uuid) => `/walk-experiences/${experienceId}`,
} as const;

// ---------------------------------------------------------------------------
// Guards and helpers
// ---------------------------------------------------------------------------

export function isCompanion(value: unknown): value is Companion {
  return typeof value === 'string' && (COMPANIONS as readonly string[]).includes(value);
}

export function isEmotion(value: unknown): value is Emotion {
  return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);
}

export function isSituation(value: unknown): value is Situation {
  return typeof value === 'string' && (SITUATIONS as readonly string[]).includes(value);
}

export function isCandidateStatus(value: unknown): value is CandidateStatus {
  return typeof value === 'string' && (CANDIDATE_STATUSES as readonly string[]).includes(value);
}

export function isAiGenerationStatus(value: unknown): value is AiGenerationStatus {
  return typeof value === 'string' && (AI_GENERATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Mirrors the server's query combination rules so the client does not have to
 * learn them from a 400 response.
 *
 * Rejects: `from` without `to`, `to` without `from`, `from` later than `to`,
 * and any mix of a date range with a tag.
 */
export function isValidListQuery(query: ListWalkExperiencesQuery): boolean {
  const hasFrom = query.from != null;
  const hasTo = query.to != null;
  const hasTag = query.tag != null;

  if (hasFrom !== hasTo) return false;
  if (hasFrom && hasTag) return false;
  // Both are `YYYY-MM-DD`, so lexicographic order is chronological order.
  if (hasFrom && hasTo && query.from! > query.to!) return false;
  return true;
}

/**
 * The detector reports epoch milliseconds; the API wants ISO 8601 with offset.
 *
 * `toISOString()` always renders UTC (`…Z`), which is a legal TIMESTAMPTZ and
 * denotes the same instant as the equivalent `+09:00` value. We do not fabricate
 * a Seoul offset here — the server stores an instant, and the only place the
 * calendar day matters is the `from`/`to` range, which is built from local
 * dates by the caller.
 */
export function toIsoDateTime(epochMs: number): IsoDateTime {
  return new Date(epochMs).toISOString();
}

/** Inverse of `toIsoDateTime`. Returns NaN for an unparseable value. */
export function fromIsoDateTime(value: IsoDateTime): number {
  return new Date(value).getTime();
}

/**
 * Normalizes user- or AI-supplied tag text to the stored form: no leading `#`,
 * trimmed. Returns null when nothing survives, which the caller should drop
 * rather than send — the server rejects blank tags.
 */
export function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#+/, '').trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, LIMITS.tagMaxLength);
}
