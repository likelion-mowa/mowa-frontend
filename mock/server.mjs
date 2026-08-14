/**
 * MOWA mock backend — behaves like the real API described in docs/backend/.
 *
 * WHY THIS IS NOT A PLAIN `json-server db.json`
 * ---------------------------------------------
 * The spec is not CRUD. It has a response envelope, bearer auth with per-user
 * isolation that hides other users' rows as 404, two state machines, an action
 * endpoint (ai-generation), snapshot-on-create, soft delete, and query-combination
 * rules that return 400. json-server's automatic router expresses none of that.
 *
 * So json-server is used for what it is actually good at here — a file-backed
 * lowdb store (`router.db`) plus its default middleware stack (CORS, logger) —
 * and every route below is written to the spec. The raw auto-CRUD router is
 * still mounted at /_db so you can inspect the underlying tables while debugging.
 *
 * ZERO DRIFT WITH THE APP
 * -----------------------
 * Code values, length limits and the query-combination rule are imported from
 * `src/api/types.ts`, the same module the app compiles against. Adding an emotion
 * there changes what this server accepts, with no second list to keep in sync.
 * That import is why the npm script passes --experimental-strip-types.
 *
 * LOCAL DEVELOPMENT ONLY. Not reachable from the deployed Vercel build (the
 * judge's browser would resolve localhost to their own machine, and an HTTPS page
 * cannot fetch http://). See mock/README.md.
 */
import { existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import jsonServer from 'json-server';

import {
  API_BASE_PATH,
  CANDIDATE_STATUSES,
  LIMITS,
  isAiGenerationStatus,
  isCandidateStatus,
  isCompanion,
  isEmotion,
  isSituation,
  isValidListQuery,
  normalizeTag,
} from '../src/api/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = join(HERE, 'seed.json');
// MOCK_DB lets the contract test run against a throwaway file so it never
// clobbers the database you have been developing against.
const DB = process.env.MOCK_DB ?? join(HERE, 'db.json');
const PORT = Number(process.env.MOCK_PORT ?? 4000);

// db.json is the mutable working copy and is gitignored. Seeding on first run
// keeps `git status` clean and makes `npm run mock:reset` a one-liner.
if (!existsSync(DB)) {
  copyFileSync(SEED, DB);
  console.log('[mock] seeded db.json from seed.json');
}

const app = jsonServer.create();
const router = jsonServer.router(DB);
const db = router.db;

app.use(jsonServer.defaults({ logger: true }));
app.use(jsonServer.bodyParser);

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

function ok(res, data, message = '요청이 성공적으로 처리되었습니다.', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

/**
 * `code` deliberately mirrors the HTTP status rather than naming a business
 * condition. The spec defines exactly one code (`INVALID_CREDENTIALS`), so any
 * taxonomy invented here would be fiction the client might come to depend on.
 * Team decision: branch on status now, split codes out once the backend
 * publishes its list. See the ApiFailure doc comment in src/api/types.ts.
 */
function fail(res, status, code, detail) {
  return res.status(status).json({
    success: false,
    message: '요청 처리 중 오류가 발생했습니다.',
    error: { code, detail },
  });
}

/** The spec hides other users' resources rather than admitting they exist. */
const notFound = (res, what) => fail(res, 404, 'NOT_FOUND', `${what}을(를) 찾을 수 없습니다.`);
const badRequest = (res, detail) => fail(res, 400, 'BAD_REQUEST', detail);
const conflict = (res, detail) => fail(res, 409, 'CONFLICT', detail);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const uuid = () => globalThis.crypto.randomUUID();
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const table = (name) => db.get(name).value();

function isIsoDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00+09:00`).getTime());
}

/** Calendar bounds are Asia/Seoul per the spec, and `to` is inclusive for the user. */
function kstRange(from, to) {
  const start = new Date(`${from}T00:00:00+09:00`);
  const endExclusive = new Date(`${to}T00:00:00+09:00`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return [start.getTime(), endExclusive.getTime()];
}

/**
 * Multi-value columns come back sorted by their own value, NOT in insertion order.
 *
 * Two reasons. It is deterministic, so the same data always renders the same way
 * and a snapshot test cannot go flaky. And it is the closer guess at the real
 * backend: these tables are `PRIMARY KEY (parent_id, value)`, so a query without
 * an ORDER BY is served from that B-tree and arrives in value order rather than
 * the order rows were written.
 *
 * That is still a guess about someone else's implementation. `emotions` and
 * `tags` are sets — compare them as sets, never by array position.
 */
const sorted = (values) => [...values].sort();

function emotionsOfDraft(draftId) {
  return sorted(
    table('experienceDraftEmotions')
      .filter((r) => r.draftId === draftId)
      .map((r) => r.emotion),
  );
}

function emotionsOfExperience(experienceId) {
  return sorted(
    table('walkExperienceEmotions')
      .filter((r) => r.experienceId === experienceId)
      .map((r) => r.emotion),
  );
}

function tagsOfExperience(experienceId) {
  return sorted(
    table('walkExperienceTags')
      .filter((r) => r.experienceId === experienceId)
      .map((r) => r.tag),
  );
}

/**
 * Validates an `emotions` array. The composite PK in the real schema is what
 * forbids duplicates, so this mirrors it at the API layer.
 */
function validateEmotions(value) {
  if (!Array.isArray(value)) return 'emotions는 배열이어야 합니다.';
  for (const e of value) {
    if (!isEmotion(e)) return `허용되지 않은 emotion입니다: ${JSON.stringify(e)}`;
  }
  if (new Set(value).size !== value.length) return '중복된 emotion은 허용되지 않습니다.';
  return null;
}

/**
 * VARCHAR(255) in the real schema, so the DB rejects an over-long value on
 * INSERT as well as UPDATE. Both routes go through here so the two cannot drift.
 */
function validateLocationSummary(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return 'locationSummary는 문자열이어야 합니다.';
  if (value.length > LIMITS.locationSummaryMaxLength) {
    return `locationSummary는 최대 ${LIMITS.locationSummaryMaxLength}자입니다.`;
  }
  return null;
}

/**
 * Returns [normalizedTags, errorMessage].
 *
 * Length is measured on the NORMALIZED value, because that is what the DB
 * column actually stores — checking the raw string would reject "  <50 chars>  "
 * that the real backend accepts after trimming.
 */
function validateTags(value) {
  if (!Array.isArray(value)) return [null, 'tags는 배열이어야 합니다.'];
  if (value.length > LIMITS.tagsMaxCount) {
    return [null, `태그는 최대 ${LIMITS.tagsMaxCount}개까지 허용됩니다.`];
  }
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return [null, '태그는 문자열이어야 합니다.'];
    const normalized = normalizeTag(raw);
    if (normalized === null) return [null, '빈 태그는 허용되지 않습니다.'];
    // normalizeTag slices to the limit, so compare against the pre-slice length.
    if (raw.trim().replace(/^#+/, '').trim().length > LIMITS.tagMaxLength) {
      return [null, `태그는 최대 ${LIMITS.tagMaxLength}자입니다.`];
    }
    out.push(normalized);
  }
  if (new Set(out).size !== out.length) return [null, '중복된 태그는 허용되지 않습니다.'];
  return [out, null];
}

function replaceJoinRows(tableName, foreignKey, id, column, values) {
  const rows = table(tableName);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i][foreignKey] === id) rows.splice(i, 1);
  }
  for (const v of values) rows.push({ [foreignKey]: id, [column]: v });
}

// ---------------------------------------------------------------------------
// Auth
//
// Tokens are `mock.<userId>` — deliberately transparent, so a failing request is
// obvious in a log. Nothing here is a security mechanism.
// ---------------------------------------------------------------------------

const api = (path) => `${API_BASE_PATH}${path}`;

function authenticate(req, res, next) {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return fail(res, 401, 'UNAUTHORIZED', 'Access Token이 없습니다.');
  }
  const token = match[1];
  const userId = token.startsWith('mock.') ? token.slice('mock.'.length) : null;
  const user = userId ? table('users').find((u) => u.id === userId) : null;
  if (!user) {
    return fail(res, 401, 'UNAUTHORIZED', '유효하지 않은 Access Token입니다.');
  }
  req.user = user;
  return next();
}

// ---------------------------------------------------------------------------
// 기능 13 — 인증 및 마이페이지
// ---------------------------------------------------------------------------

app.post(api('/auth/login'), (req, res) => {
  const { loginId, password } = req.body ?? {};
  if (typeof loginId !== 'string' || typeof password !== 'string') {
    return badRequest(res, 'loginId와 password가 필요합니다.');
  }
  const user = table('users').find((u) => u.loginId === loginId && u.password === password);
  // A missing id and a wrong password are deliberately indistinguishable.
  if (!user) {
    return fail(res, 401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  return ok(res, { accessToken: `mock.${user.id}` }, '로그인에 성공했습니다.');
});

app.get(api('/users/me'), authenticate, (req, res) =>
  ok(res, { userId: req.user.id, loginId: req.user.loginId, nickname: req.user.nickname }),
);

app.patch(api('/users/me'), authenticate, (req, res) => {
  const { nickname } = req.body ?? {};
  if (typeof nickname !== 'string' || nickname.trim().length === 0) {
    return badRequest(res, 'nickname은 필수이며 빈 문자열일 수 없습니다.');
  }
  if (nickname.length > LIMITS.nicknameMaxLength) {
    return badRequest(res, `nickname은 최대 ${LIMITS.nicknameMaxLength}자입니다.`);
  }
  req.user.nickname = nickname;
  req.user.updatedAt = nowIso();
  db.write();
  return ok(res, { userId: req.user.id, loginId: req.user.loginId, nickname });
});

// ---------------------------------------------------------------------------
// 기능 1 — 산책 후보
// ---------------------------------------------------------------------------

const candidateView = (c) => ({
  candidateId: c.id,
  detectedStartAt: c.detectedStartAt,
  detectedEndAt: c.detectedEndAt,
  durationSeconds: c.durationSeconds,
  locationSummary: c.locationSummary,
  status: c.status,
});

const findCandidate = (id, userId) =>
  table('walkCandidates').find((c) => c.id === id && c.userId === userId) ?? null;

app.post(api('/walk-candidates'), authenticate, (req, res) => {
  const { detectedStartAt, locationSummary } = req.body ?? {};
  if (detectedStartAt === undefined) return badRequest(res, 'detectedStartAt은 필수입니다.');
  if (!isIsoDateTime(detectedStartAt)) return badRequest(res, 'detectedStartAt 형식이 올바르지 않습니다.');
  const locationError = validateLocationSummary(locationSummary);
  if (locationError) return badRequest(res, locationError);

  const candidate = {
    id: uuid(),
    userId: req.user.id,
    detectedStartAt,
    detectedEndAt: null,
    durationSeconds: null,
    locationSummary: locationSummary ?? null,
    status: 'DETECTED',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  table('walkCandidates').push(candidate);
  db.write();
  return ok(res, candidateView(candidate), '산책 후보가 생성되었습니다.', 201);
});

app.get(api('/walk-candidates/:candidateId'), authenticate, (req, res) => {
  const candidate = findCandidate(req.params.candidateId, req.user.id);
  if (!candidate) return notFound(res, '산책 후보');
  return ok(res, candidateView(candidate));
});

/** DETECTED → SUGGESTED → RECORDING | SKIPPED. Nothing else is reachable. */
const ALLOWED_TRANSITIONS = {
  DETECTED: ['SUGGESTED'],
  SUGGESTED: ['RECORDING', 'SKIPPED'],
  RECORDING: [],
  SKIPPED: [],
};

app.patch(api('/walk-candidates/:candidateId'), authenticate, (req, res) => {
  const candidate = findCandidate(req.params.candidateId, req.user.id);
  if (!candidate) return notFound(res, '산책 후보');
  const body = req.body ?? {};

  if (has(body, 'status')) {
    if (!isCandidateStatus(body.status)) {
      return badRequest(res, `허용되지 않은 status입니다. 허용값: ${CANDIDATE_STATUSES.join(', ')}`);
    }
    if (body.status !== candidate.status
      && !ALLOWED_TRANSITIONS[candidate.status].includes(body.status)) {
      return badRequest(res, `허용되지 않은 상태 전이입니다: ${candidate.status} → ${body.status}`);
    }
  }

  if (has(body, 'detectedEndAt')) {
    if (!isIsoDateTime(body.detectedEndAt)) {
      return badRequest(res, 'detectedEndAt 형식이 올바르지 않습니다.');
    }
    if (new Date(body.detectedEndAt).getTime() < new Date(candidate.detectedStartAt).getTime()) {
      return badRequest(res, '종료 시각은 시작 시각보다 빠를 수 없습니다.');
    }
  }

  if (has(body, 'durationSeconds')) {
    if (!Number.isInteger(body.durationSeconds) || body.durationSeconds < 0) {
      return badRequest(res, 'durationSeconds는 0 이상의 정수여야 합니다.');
    }
  }

  if (has(body, 'locationSummary')) {
    const locationError = validateLocationSummary(body.locationSummary);
    if (locationError) return badRequest(res, locationError);
  }

  for (const key of ['detectedEndAt', 'durationSeconds', 'locationSummary', 'status']) {
    if (has(body, key)) candidate[key] = body[key];
  }
  candidate.updatedAt = nowIso();
  db.write();
  return ok(res, candidateView(candidate));
});

// ---------------------------------------------------------------------------
// 기능 2 — 경험 초안
// ---------------------------------------------------------------------------

const draftView = (d) => ({
  draftId: d.id,
  candidateId: d.candidateId,
  photoUrl: d.photoUrl,
  companion: d.companion,
  emotions: emotionsOfDraft(d.id),
  situation: d.situation,
  aiGenerationStatus: d.aiGenerationStatus,
});

const findDraft = (id, userId) =>
  table('experienceDrafts').find((d) => d.id === id && d.userId === userId) ?? null;

/** Shared by draft create and update. Returns an error string or null. */
function validateDraftInput(body) {
  if (has(body, 'companion') && body.companion != null && !isCompanion(body.companion)) {
    return '허용되지 않은 companion입니다.';
  }
  if (has(body, 'situation') && body.situation != null && !isSituation(body.situation)) {
    return '허용되지 않은 situation입니다.';
  }
  if (has(body, 'photoUrl') && body.photoUrl != null && typeof body.photoUrl !== 'string') {
    return 'photoUrl은 문자열이어야 합니다.';
  }
  if (has(body, 'emotions')) return validateEmotions(body.emotions);
  return null;
}

app.post(api('/walk-candidates/:candidateId/experience-drafts'), authenticate, (req, res) => {
  const candidate = findCandidate(req.params.candidateId, req.user.id);
  if (!candidate) return notFound(res, '산책 후보');
  if (candidate.status !== 'RECORDING') {
    return badRequest(res, `Candidate 상태가 RECORDING이어야 합니다. 현재: ${candidate.status}`);
  }
  if (table('experienceDrafts').some((d) => d.candidateId === candidate.id)) {
    return conflict(res, '이미 Draft가 존재하는 Candidate입니다.');
  }

  const body = req.body ?? {};
  const error = validateDraftInput(body);
  if (error) return badRequest(res, error);

  const draft = {
    id: uuid(),
    userId: req.user.id,
    candidateId: candidate.id,
    photoUrl: body.photoUrl ?? null,
    companion: body.companion ?? null,
    situation: body.situation ?? null,
    aiTitle: null,
    aiBody: null,
    aiGenerationStatus: 'PENDING',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  table('experienceDrafts').push(draft);
  replaceJoinRows('experienceDraftEmotions', 'draftId', draft.id, 'emotion', body.emotions ?? []);
  db.write();
  return ok(res, draftView(draft), '경험 초안이 생성되었습니다.', 201);
});

app.patch(api('/experience-drafts/:draftId'), authenticate, (req, res) => {
  const draft = findDraft(req.params.draftId, req.user.id);
  if (!draft) return notFound(res, '경험 초안');
  if (!['PENDING', 'FAILED'].includes(draft.aiGenerationStatus)) {
    return badRequest(res, `${draft.aiGenerationStatus} 상태에서는 초안을 수정할 수 없습니다.`);
  }

  const body = req.body ?? {};
  const error = validateDraftInput(body);
  if (error) return badRequest(res, error);

  for (const key of ['photoUrl', 'companion', 'situation']) {
    if (has(body, key)) draft[key] = body[key] ?? null;
  }
  if (has(body, 'emotions')) {
    replaceJoinRows('experienceDraftEmotions', 'draftId', draft.id, 'emotion', body.emotions);
  }
  draft.updatedAt = nowIso();
  db.write();
  return ok(res, draftView(draft));
});

// ---------------------------------------------------------------------------
// 기능 4 — AI 산책 일기 생성
//
// Deterministic stand-in for OpenAI. `?fail=1` forces the FAILED branch so the
// retry path is testable without breaking anything.
// ---------------------------------------------------------------------------

const SITUATION_WORD = {
  MORNING: '아침', AFTERNOON: '오후', EVENING: '저녁',
  IN_TRANSIT: '이동 중', EXPLORING: '탐험',
};
const COMPANION_WORD = { ALONE: '혼자', WITH_SOMEONE: '누군가와', PET: '반려동물과' };
const EMOTION_WORD = {
  CALM: '차분한', HAPPY: '행복한', TIRED: '피곤한',
  REFRESHED: '상쾌한', PENSIVE: '생각에 잠긴',
};

app.post(api('/experience-drafts/:draftId/ai-generation'), authenticate, (req, res) => {
  const draft = findDraft(req.params.draftId, req.user.id);
  if (!draft) return notFound(res, '경험 초안');
  if (!['PENDING', 'FAILED'].includes(draft.aiGenerationStatus)) {
    return badRequest(res, `${draft.aiGenerationStatus} 상태에서는 생성을 요청할 수 없습니다.`);
  }

  if (req.query.fail === '1') {
    draft.aiGenerationStatus = 'FAILED';
    draft.updatedAt = nowIso();
    db.write();
    return fail(res, 502, 'AI_GENERATION_FAILED', 'AI 생성에 실패했습니다. 재시도할 수 있습니다.');
  }

  const candidate = table('walkCandidates').find((c) => c.id === draft.candidateId);
  const emotions = emotionsOfDraft(draft.id);
  const place = candidate?.locationSummary ?? null;
  const situation = draft.situation ? SITUATION_WORD[draft.situation] : null;

  // Only values the user actually provided appear in the output — the spec
  // forbids the model asserting relationships or feelings that were not entered.
  const titleParts = [situation, place, '산책'].filter(Boolean);
  const bodyParts = [
    situation ? `${situation}에 걸었다.` : '걸었다.',
    place ? `${place} 근처를 지났다.` : null,
    draft.companion ? `${COMPANION_WORD[draft.companion]} 걸었다.` : null,
    emotions.length ? `${emotions.map((e) => EMOTION_WORD[e]).join(', ')} 기분이었다.` : null,
    candidate?.durationSeconds ? `${Math.round(candidate.durationSeconds / 60)}분쯤 걸었다.` : null,
  ].filter(Boolean);

  draft.aiTitle = titleParts.join(' ').slice(0, LIMITS.titleMaxLength);
  draft.aiBody = bodyParts.join(' ');
  draft.aiGenerationStatus = 'SUCCESS';
  draft.updatedAt = nowIso();
  db.write();

  const suggestedTags = [place, situation, draft.companion ? COMPANION_WORD[draft.companion] : null]
    .filter(Boolean)
    .concat(emotions.map((e) => EMOTION_WORD[e]))
    .slice(0, LIMITS.tagsMaxCount);

  return ok(res, {
    draftId: draft.id,
    aiTitle: draft.aiTitle,
    aiBody: draft.aiBody,
    // Never persisted — the user edits these and sends back a final `tags`.
    suggestedTags,
    aiGenerationStatus: draft.aiGenerationStatus,
  });
});

// ---------------------------------------------------------------------------
// 기능 5·6·7·8 — 산책 경험
// ---------------------------------------------------------------------------

/**
 * MOCK_LIST_DURATION=1 adds `durationSeconds` to every list row. It is OFF by
 * default because the spec's 기능 6 response does not include it — this switch
 * exists only to exercise the archive's 누적 시간 sum, which the client asked
 * the backend to make possible (docs/api-implementation.md 공백 8). Do not
 * treat a green run with it on as evidence the real backend sends the field.
 */
const LIST_DURATION = process.env.MOCK_LIST_DURATION === '1';

const listItemView = (e) => ({
  experienceId: e.id,
  photoUrl: e.photoUrl,
  title: e.title,
  startedAt: e.startedAt,
  locationSummary: e.locationSummary,
  companion: e.companion,
  emotions: emotionsOfExperience(e.id),
  situation: e.situation,
  tags: tagsOfExperience(e.id),
  ...(LIST_DURATION ? { durationSeconds: e.durationSeconds } : {}),
});

const detailView = (e) => ({
  experienceId: e.id,
  title: e.title,
  body: e.body,
  photoUrl: e.photoUrl,
  startedAt: e.startedAt,
  endedAt: e.endedAt,
  durationSeconds: e.durationSeconds,
  locationSummary: e.locationSummary,
  companion: e.companion,
  emotions: emotionsOfExperience(e.id),
  situation: e.situation,
  tags: tagsOfExperience(e.id),
});

const findExperience = (id, userId) =>
  table('walkExperiences').find(
    (e) => e.id === id && e.userId === userId && e.deletedAt == null,
  ) ?? null;

app.post(api('/walk-experiences'), authenticate, (req, res) => {
  const body = req.body ?? {};
  if (typeof body.draftId !== 'string') return badRequest(res, 'draftId는 필수입니다.');

  const draft = findDraft(body.draftId, req.user.id);
  if (!draft) return notFound(res, '경험 초안');
  if (draft.aiGenerationStatus !== 'SUCCESS') {
    return badRequest(res, `Draft 상태가 SUCCESS여야 합니다. 현재: ${draft.aiGenerationStatus}`);
  }
  // draft_id UNIQUE survives soft delete, so a deleted experience still blocks.
  if (table('walkExperiences').some((e) => e.draftId === draft.id)) {
    return conflict(res, '이미 해당 Draft로 생성된 산책 경험이 있습니다.');
  }

  const candidate = table('walkCandidates').find((c) => c.id === draft.candidateId);
  if (!candidate) return badRequest(res, '연결된 Candidate를 찾을 수 없습니다.');
  if (candidate.detectedEndAt == null) return badRequest(res, 'Candidate의 종료 시각이 없습니다.');
  if (candidate.durationSeconds == null) return badRequest(res, 'Candidate의 지속 시간이 없습니다.');

  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return badRequest(res, 'title은 필수이며 빈 문자열일 수 없습니다.');
  }
  if (body.title.length > LIMITS.titleMaxLength) {
    return badRequest(res, `title은 최대 ${LIMITS.titleMaxLength}자입니다.`);
  }
  const draftError = validateDraftInput(body);
  if (draftError) return badRequest(res, draftError);

  let tags = [];
  if (has(body, 'tags')) {
    const [normalized, tagError] = validateTags(body.tags);
    if (tagError) return badRequest(res, tagError);
    tags = normalized;
  }

  const experience = {
    id: uuid(),
    userId: req.user.id,
    draftId: draft.id,
    title: body.title,
    body: body.body ?? null,
    photoUrl: body.photoUrl ?? null,
    // Time and place are snapshotted from the candidate, never sent by the client.
    startedAt: candidate.detectedStartAt,
    endedAt: candidate.detectedEndAt,
    durationSeconds: candidate.durationSeconds,
    locationSummary: candidate.locationSummary,
    companion: body.companion ?? null,
    situation: body.situation ?? null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  };
  table('walkExperiences').push(experience);
  replaceJoinRows('walkExperienceEmotions', 'experienceId', experience.id, 'emotion', body.emotions ?? []);
  replaceJoinRows('walkExperienceTags', 'experienceId', experience.id, 'tag', tags);
  db.write();

  return ok(
    res,
    { experienceId: experience.id, draftId: draft.id, createdAt: experience.createdAt },
    '산책 경험이 저장되었습니다.',
    201,
  );
});

app.get(api('/walk-experiences'), authenticate, (req, res) => {
  const { from, to, tag } = req.query;
  const query = {};
  if (from !== undefined) query.from = from;
  if (to !== undefined) query.to = to;
  if (tag !== undefined) query.tag = tag;

  if (!isValidListQuery(query)) {
    return badRequest(
      res,
      'from과 to는 함께 전달해야 하고 from ≤ to여야 하며, 기간과 tag는 함께 사용할 수 없습니다.',
    );
  }
  if (query.from !== undefined && (!isIsoDate(query.from) || !isIsoDate(query.to))) {
    return badRequest(res, 'from, to는 YYYY-MM-DD 형식이어야 합니다.');
  }

  let rows = table('walkExperiences').filter(
    (e) => e.userId === req.user.id && e.deletedAt == null,
  );

  if (query.from !== undefined) {
    const [start, endExclusive] = kstRange(query.from, query.to);
    rows = rows.filter((e) => {
      const t = new Date(e.startedAt).getTime();
      return t >= start && t < endExclusive;
    });
  }
  if (query.tag !== undefined) {
    rows = rows.filter((e) => tagsOfExperience(e.id).includes(query.tag));
  }

  rows.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return ok(res, rows.map(listItemView));
});

app.get(api('/walk-experiences/:experienceId'), authenticate, (req, res) => {
  const experience = findExperience(req.params.experienceId, req.user.id);
  if (!experience) return notFound(res, '산책 경험');
  return ok(res, detailView(experience));
});

/** Snapshot columns are outside the MVP edit scope; sending them is a client bug. */
const IMMUTABLE = ['startedAt', 'endedAt', 'durationSeconds', 'locationSummary'];

app.patch(api('/walk-experiences/:experienceId'), authenticate, (req, res) => {
  const experience = findExperience(req.params.experienceId, req.user.id);
  if (!experience) return notFound(res, '산책 경험');
  const body = req.body ?? {};

  for (const key of IMMUTABLE) {
    if (has(body, key)) return badRequest(res, `${key}은(는) 수정할 수 없습니다.`);
  }
  if (has(body, 'title')) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      return badRequest(res, 'title은 빈 값으로 변경할 수 없습니다.');
    }
    if (body.title.length > LIMITS.titleMaxLength) {
      return badRequest(res, `title은 최대 ${LIMITS.titleMaxLength}자입니다.`);
    }
  }
  const draftError = validateDraftInput(body);
  if (draftError) return badRequest(res, draftError);

  let tags = null;
  if (has(body, 'tags')) {
    const [normalized, tagError] = validateTags(body.tags);
    if (tagError) return badRequest(res, tagError);
    tags = normalized;
  }

  if (has(body, 'title')) experience.title = body.title;
  for (const key of ['body', 'photoUrl', 'companion', 'situation']) {
    if (has(body, key)) experience[key] = body[key] ?? null;
  }
  if (has(body, 'emotions')) {
    replaceJoinRows('walkExperienceEmotions', 'experienceId', experience.id, 'emotion', body.emotions);
  }
  if (tags !== null) {
    replaceJoinRows('walkExperienceTags', 'experienceId', experience.id, 'tag', tags);
  }
  experience.updatedAt = nowIso();
  db.write();
  return ok(res, detailView(experience));
});

app.delete(api('/walk-experiences/:experienceId'), authenticate, (req, res) => {
  const experience = findExperience(req.params.experienceId, req.user.id);
  if (!experience) return notFound(res, '산책 경험');
  experience.deletedAt = nowIso();
  experience.updatedAt = experience.deletedAt;
  db.write();
  return ok(res, { experienceId: experience.id, deletedAt: experience.deletedAt }, '삭제되었습니다.');
});

// ---------------------------------------------------------------------------
// Debug + fallthrough
// ---------------------------------------------------------------------------

/** Raw tables, for eyeballing state while debugging. Not part of the contract. */
app.use('/_db', router);

app.use(API_BASE_PATH, (req, res) =>
  fail(res, 404, 'NOT_FOUND', `${req.method} ${req.originalUrl} 경로가 없습니다.`),
);

// Malformed JSON reaches here as a body-parser error.
app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') return badRequest(res, 'JSON 본문을 파싱할 수 없습니다.');
  return next(error);
});

app.listen(PORT, () => {
  console.log(`[mock] MOWA mock backend on http://localhost:${PORT}${API_BASE_PATH}`);
  console.log('[mock] test accounts: mowa01 / mowa02  (password: "password")');
  console.log(`[mock] raw tables: http://localhost:${PORT}/_db`);
  // Assert the import actually resolved, so a broken contract import fails loudly
  // at startup instead of silently accepting every value.
  if (!isAiGenerationStatus('SUCCESS')) throw new Error('contract import broken');
});
