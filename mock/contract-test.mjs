/**
 * Contract test for the mock backend.
 *
 * Every assertion below is traceable to a rule in docs/backend/api-spec.md. The
 * point is not to test the mock for its own sake — it is to make the mock's
 * divergence from the spec visible, so code written against it does not have to
 * be rewritten when the real backend arrives.
 *
 * Spawns its own server on a spare port against a throwaway database, so it is
 * safe to run while `npm run mock` is up.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_TEST_PORT ?? 4999);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const TEST_DB = join(tmpdir(), `mowa-contract-test-${process.pid}.json`);

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function call(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : (raw ?? JSON.stringify(body)),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    /* non-JSON response — leave null so the assertion reports it */
  }
  return { status: response.status, json };
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/walk-experiences`);
      if (r.status === 401) return true; // up, and correctly demanding auth
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

// ---------------------------------------------------------------------------

copyFileSync(join(HERE, 'seed.json'), TEST_DB);

const server = spawn(
  process.execPath,
  ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', join(HERE, 'server.mjs')],
  { env: { ...process.env, MOCK_PORT: String(PORT), MOCK_DB: TEST_DB }, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));

function shutdown(code) {
  server.kill('SIGTERM');
  rmSync(TEST_DB, { force: true });
  process.exit(code);
}

if (!(await waitForServer())) {
  console.error('server did not start. output:\n' + serverLog.join(''));
  shutdown(1);
}

const USER1_CANDIDATE_RECORDING = 'aaaaaaa1-0000-4000-8000-000000000002';
const USER1_CANDIDATE_DETECTED = 'aaaaaaa1-0000-4000-8000-000000000003';
const USER2_CANDIDATE = 'aaaaaaa1-0000-4000-8000-000000000009';
const USER1_EXPERIENCE = 'ccccccc1-0000-4000-8000-000000000001';

try {
  // -------------------------------------------------------------------------
  section('인증 (기능 13)');

  const badLogin = await call('POST', '/auth/login', { body: { loginId: 'mowa01', password: 'wrong' } });
  check('잘못된 비밀번호 → 401 INVALID_CREDENTIALS',
    badLogin.status === 401 && badLogin.json?.error?.code === 'INVALID_CREDENTIALS',
    `got ${badLogin.status}/${badLogin.json?.error?.code}`);

  const missingLogin = await call('POST', '/auth/login', { body: { loginId: 'nope', password: 'password' } });
  check('없는 ID도 동일한 401 (존재 여부 비노출)',
    missingLogin.status === 401 && missingLogin.json?.error?.code === 'INVALID_CREDENTIALS');

  const login = await call('POST', '/auth/login', { body: { loginId: 'mowa01', password: 'password' } });
  check('로그인 성공 → 200 + accessToken',
    login.status === 200 && typeof login.json?.data?.accessToken === 'string');
  check('성공 응답 봉투 {success,message,data}',
    login.json?.success === true && typeof login.json?.message === 'string' && 'data' in login.json);
  const token = login.json.data.accessToken;

  const login2 = await call('POST', '/auth/login', { body: { loginId: 'mowa02', password: 'password' } });
  const token2 = login2.json.data.accessToken;

  const noAuth = await call('GET', '/users/me');
  check('토큰 없음 → 401', noAuth.status === 401 && noAuth.json?.success === false);
  check('실패 응답 봉투 {success,message,error:{code,detail}}',
    noAuth.json?.error?.code !== undefined && noAuth.json?.error?.detail !== undefined);

  const badToken = await call('GET', '/users/me', { token: 'mock.does-not-exist' });
  check('유효하지 않은 토큰 → 401', badToken.status === 401);

  const me = await call('GET', '/users/me', { token });
  check('GET /users/me → userId, loginId, nickname',
    me.status === 200 && me.json.data.loginId === 'mowa01' && me.json.data.nickname === '모아');

  const nickEmpty = await call('PATCH', '/users/me', { token, body: { nickname: '   ' } });
  check('빈 nickname → 400', nickEmpty.status === 400);

  const nickLong = await call('PATCH', '/users/me', { token, body: { nickname: 'ㄱ'.repeat(31) } });
  check('nickname 31자 → 400', nickLong.status === 400);

  const nickOk = await call('PATCH', '/users/me', { token, body: { nickname: '모아수정' } });
  check('nickname 수정 → 200', nickOk.status === 200 && nickOk.json.data.nickname === '모아수정');

  // -------------------------------------------------------------------------
  section('산책 후보 (기능 1)');

  const noStart = await call('POST', '/walk-candidates', { token, body: { locationSummary: '망원동' } });
  check('detectedStartAt 누락 → 400', noStart.status === 400);

  const badStart = await call('POST', '/walk-candidates', { token, body: { detectedStartAt: 'not-a-date' } });
  check('잘못된 시각 형식 → 400', badStart.status === 400);

  const created = await call('POST', '/walk-candidates', {
    token, body: { detectedStartAt: '2026-08-12T13:00:00+09:00', locationSummary: '망원동' },
  });
  check('후보 생성 → 201 + status DETECTED',
    created.status === 201 && created.json.data.status === 'DETECTED',
    `got ${created.status}/${created.json?.data?.status}`);
  const candidateId = created.json.data.candidateId;

  const otherCandidate = await call('GET', `/walk-candidates/${USER2_CANDIDATE}`, { token });
  check('다른 사용자의 Candidate → 404 (403 아님)', otherCandidate.status === 404);

  const jump = await call('PATCH', `/walk-candidates/${candidateId}`, { token, body: { status: 'RECORDING' } });
  check('DETECTED → RECORDING 직행 → 400 (허용되지 않은 전이)', jump.status === 400);

  const badStatus = await call('PATCH', `/walk-candidates/${candidateId}`, { token, body: { status: 'NOPE' } });
  check('허용되지 않은 status 값 → 400', badStatus.status === 400);

  const toSuggested = await call('PATCH', `/walk-candidates/${candidateId}`, { token, body: { status: 'SUGGESTED' } });
  check('DETECTED → SUGGESTED → 200', toSuggested.status === 200);

  const endBeforeStart = await call('PATCH', `/walk-candidates/${candidateId}`, {
    token, body: { detectedEndAt: '2026-08-12T12:00:00+09:00' },
  });
  check('종료 < 시작 → 400', endBeforeStart.status === 400);

  const negative = await call('PATCH', `/walk-candidates/${candidateId}`, { token, body: { durationSeconds: -5 } });
  check('음수 지속 시간 → 400', negative.status === 400);

  const toRecording = await call('PATCH', `/walk-candidates/${candidateId}`, {
    token,
    body: { status: 'RECORDING', detectedEndAt: '2026-08-12T13:40:00+09:00', durationSeconds: 2400 },
  });
  check('SUGGESTED → RECORDING + 종료 정보 → 200',
    toRecording.status === 200 && toRecording.json.data.durationSeconds === 2400);

  // -------------------------------------------------------------------------
  section('경험 초안 (기능 2)');

  const draftOnDetected = await call('POST', `/walk-candidates/${USER1_CANDIDATE_DETECTED}/experience-drafts`, {
    token, body: {},
  });
  check('RECORDING이 아닌 Candidate에 Draft → 400', draftOnDetected.status === 400);

  const badEmotion = await call('POST', `/walk-candidates/${candidateId}/experience-drafts`, {
    token, body: { emotions: ['NOPE'] },
  });
  check('허용되지 않은 emotion → 400', badEmotion.status === 400);

  const dupEmotion = await call('POST', `/walk-candidates/${candidateId}/experience-drafts`, {
    token, body: { emotions: ['CALM', 'CALM'] },
  });
  check('중복 emotion → 400', dupEmotion.status === 400);

  const draft = await call('POST', `/walk-candidates/${candidateId}/experience-drafts`, {
    token, body: { companion: 'ALONE', emotions: ['CALM', 'PENSIVE'], situation: 'AFTERNOON' },
  });
  check('Draft 생성 → 201 + aiGenerationStatus PENDING',
    draft.status === 201 && draft.json.data.aiGenerationStatus === 'PENDING');
  check('emotions 다중 저장', draft.json.data.emotions.length === 2);
  const draftId = draft.json.data.draftId;

  const dupDraft = await call('POST', `/walk-candidates/${candidateId}/experience-drafts`, { token, body: {} });
  check('Candidate당 Draft 2개 → 409', dupDraft.status === 409);

  const replaced = await call('PATCH', `/experience-drafts/${draftId}`, { token, body: { emotions: ['HAPPY'] } });
  check('PATCH emotions는 전체 교체',
    replaced.status === 200 && replaced.json.data.emotions.length === 1
      && replaced.json.data.emotions[0] === 'HAPPY');

  const cleared = await call('PATCH', `/experience-drafts/${draftId}`, { token, body: { emotions: [] } });
  check('emotions: [] → 전체 제거', cleared.json.data.emotions.length === 0);

  const kept = await call('PATCH', `/experience-drafts/${draftId}`, { token, body: { situation: 'EVENING' } });
  check('emotions 생략 → 기존 유지', kept.json.data.emotions.length === 0 && kept.json.data.situation === 'EVENING');

  const nulled = await call('PATCH', `/experience-drafts/${draftId}`, { token, body: { companion: null } });
  check('companion: null → 제거', nulled.json.data.companion === null);

  await call('PATCH', `/experience-drafts/${draftId}`, { token, body: { emotions: ['CALM', 'PENSIVE'], companion: 'ALONE' } });

  // -------------------------------------------------------------------------
  section('AI 생성 (기능 4)');

  const failGen = await call('POST', `/experience-drafts/${draftId}/ai-generation?fail=1`, { token });
  check('?fail=1 → 502 + FAILED 전이', failGen.status === 502);

  const retry = await call('POST', `/experience-drafts/${draftId}/ai-generation`, { token });
  check('FAILED에서 재시도 허용 → 200 + SUCCESS',
    retry.status === 200 && retry.json.data.aiGenerationStatus === 'SUCCESS');
  check('aiTitle / aiBody 존재',
    typeof retry.json.data.aiTitle === 'string' && retry.json.data.aiTitle.length > 0
      && typeof retry.json.data.aiBody === 'string');
  check('suggestedTags 반환', Array.isArray(retry.json.data.suggestedTags));

  const regen = await call('POST', `/experience-drafts/${draftId}/ai-generation`, { token });
  check('SUCCESS에서 재생성 → 400', regen.status === 400);

  const editAfterSuccess = await call('PATCH', `/experience-drafts/${draftId}`, { token, body: { situation: 'MORNING' } });
  check('SUCCESS 상태에서 Draft 수정 → 400', editAfterSuccess.status === 400);

  // -------------------------------------------------------------------------
  section('산책 경험 확정 (기능 5)');

  const emptyTitle = await call('POST', '/walk-experiences', { token, body: { draftId, title: '  ' } });
  check('빈 title → 400', emptyTitle.status === 400);

  const longTitle = await call('POST', '/walk-experiences', { token, body: { draftId, title: 'ㄱ'.repeat(101) } });
  check('title 101자 → 400', longTitle.status === 400);

  const tooManyTags = await call('POST', '/walk-experiences', {
    token, body: { draftId, title: '제목', tags: Array.from({ length: 11 }, (_, i) => `태그${i}`) },
  });
  check('태그 11개 → 400', tooManyTags.status === 400);

  const dupTags = await call('POST', '/walk-experiences', {
    token, body: { draftId, title: '제목', tags: ['망원동', '망원동'] },
  });
  check('중복 태그 → 400', dupTags.status === 400);

  const blankTag = await call('POST', '/walk-experiences', {
    token, body: { draftId, title: '제목', tags: ['  '] },
  });
  check('공백 태그 → 400', blankTag.status === 400);

  const confirmed = await call('POST', '/walk-experiences', {
    token,
    body: {
      draftId, title: '오후 산책', body: '천천히 걸었다.',
      companion: 'ALONE', emotions: ['CALM'], situation: 'AFTERNOON',
      tags: ['#망원동', '오후산책'],
    },
  });
  check('경험 확정 → 201', confirmed.status === 201, `got ${confirmed.status}`);
  const experienceId = confirmed.json.data.experienceId;

  const dupConfirm = await call('POST', '/walk-experiences', { token, body: { draftId, title: '또 저장' } });
  check('같은 Draft로 재확정 → 409', dupConfirm.status === 409);

  const detail = await call('GET', `/walk-experiences/${experienceId}`, { token });
  check('Candidate 시간·장소가 Snapshot됨',
    detail.json.data.startedAt === '2026-08-12T13:00:00+09:00'
      && detail.json.data.durationSeconds === 2400
      && detail.json.data.locationSummary === '망원동',
    JSON.stringify({ s: detail.json.data.startedAt, d: detail.json.data.durationSeconds }));
  check('태그는 # 없이 저장', detail.json.data.tags.includes('망원동') && !detail.json.data.tags.includes('#망원동'));

  // 종료 정보가 없는 Candidate는 Snapshot을 만들 수 없으므로 확정이 막혀야 합니다.
  const openCandidate = await call('POST', '/walk-candidates', {
    token, body: { detectedStartAt: '2026-08-12T20:00:00+09:00' },
  });
  const openId = openCandidate.json.data.candidateId;
  await call('PATCH', `/walk-candidates/${openId}`, { token, body: { status: 'SUGGESTED' } });
  await call('PATCH', `/walk-candidates/${openId}`, { token, body: { status: 'RECORDING' } });
  const openDraft = await call('POST', `/walk-candidates/${openId}/experience-drafts`, { token, body: {} });
  check('종료 정보 없는 Candidate에도 Draft는 생성 가능 → 201', openDraft.status === 201);
  const openDraftId = openDraft.json.data.draftId;
  await call('POST', `/experience-drafts/${openDraftId}/ai-generation`, { token });
  const openConfirm = await call('POST', '/walk-experiences', {
    token, body: { draftId: openDraftId, title: '종료 없는 산책' },
  });
  check('Candidate 종료 시각 누락 → 확정 400', openConfirm.status === 400,
    `got ${openConfirm.status}`);

  // -------------------------------------------------------------------------
  section('목록·캘린더·태그 조회 (기능 6·12)');

  const fromOnly = await call('GET', '/walk-experiences?from=2026-08-01', { token });
  check('from만 전달 → 400', fromOnly.status === 400);

  const toOnly = await call('GET', '/walk-experiences?to=2026-08-31', { token });
  check('to만 전달 → 400', toOnly.status === 400);

  const reversed = await call('GET', '/walk-experiences?from=2026-08-31&to=2026-08-01', { token });
  check('from > to → 400', reversed.status === 400);

  const mixed = await call('GET', '/walk-experiences?from=2026-08-01&to=2026-08-31&tag=망원동', { token });
  check('기간 + tag 동시 사용 → 400', mixed.status === 400);

  const all = await call('GET', '/walk-experiences', { token });
  check('전체 조회 → 200', all.status === 200 && Array.isArray(all.json.data));
  check('기본 정렬 startedAt DESC',
    all.json.data.length >= 2
      && new Date(all.json.data[0].startedAt) >= new Date(all.json.data[1].startedAt));
  check('목록 항목에 emotions[]·tags[] 포함',
    Array.isArray(all.json.data[0].emotions) && Array.isArray(all.json.data[0].tags));

  const dayQuery = await call('GET', '/walk-experiences?from=2026-08-11&to=2026-08-11', { token });
  check('일 조회 (KST 경계, to 포함)',
    dayQuery.json.data.length === 1 && dayQuery.json.data[0].experienceId === USER1_EXPERIENCE,
    `got ${dayQuery.json.data.length} rows`);

  const tagQuery = await call('GET', '/walk-experiences?tag=오후산책', { token });
  check('태그 조회', tagQuery.json.data.length === 2, `got ${tagQuery.json.data.length}`);

  const noMatch = await call('GET', '/walk-experiences?tag=없는태그', { token });
  check('결과 없음 → 빈 배열', noMatch.status === 200 && noMatch.json.data.length === 0);

  const user2List = await call('GET', '/walk-experiences', { token: token2 });
  check('사용자별 데이터 분리', user2List.json.data.length === 0, `got ${user2List.json.data.length}`);

  // -------------------------------------------------------------------------
  section('수정·삭제 (기능 8)');

  const immutable = await call('PATCH', `/walk-experiences/${experienceId}`, {
    token, body: { startedAt: '2020-01-01T00:00:00+09:00' },
  });
  check('startedAt 수정 시도 → 400', immutable.status === 400);

  const clearTitle = await call('PATCH', `/walk-experiences/${experienceId}`, { token, body: { title: '' } });
  check('title 빈 값으로 변경 → 400', clearTitle.status === 400);

  const patched = await call('PATCH', `/walk-experiences/${experienceId}`, {
    token, body: { title: '수정된 제목', tags: ['연남동'] },
  });
  check('수정 → 200, tags 전체 교체',
    patched.status === 200 && patched.json.data.title === '수정된 제목'
      && patched.json.data.tags.length === 1 && patched.json.data.tags[0] === '연남동');

  const otherUserPatch = await call('PATCH', `/walk-experiences/${experienceId}`, {
    token: token2, body: { title: '남의 것' },
  });
  check('다른 사용자의 경험 수정 → 404', otherUserPatch.status === 404);

  const deleted = await call('DELETE', `/walk-experiences/${experienceId}`, { token });
  check('삭제 → 200 (soft delete)', deleted.status === 200 && deleted.json.data.deletedAt != null);

  const afterDelete = await call('GET', `/walk-experiences/${experienceId}`, { token });
  check('삭제 후 상세 조회 → 404', afterDelete.status === 404);

  const deleteAgain = await call('DELETE', `/walk-experiences/${experienceId}`, { token });
  check('이미 삭제된 경험 재삭제 → 404', deleteAgain.status === 404);

  const listAfterDelete = await call('GET', '/walk-experiences', { token });
  check('삭제된 경험은 목록에서 제외',
    !listAfterDelete.json.data.some((e) => e.experienceId === experienceId));

  const reconfirm = await call('POST', '/walk-experiences', { token, body: { draftId, title: '부활' } });
  check('Soft delete 후에도 같은 Draft 재확정 불가 → 409', reconfirm.status === 409);

  // -------------------------------------------------------------------------
  section('기타');

  const unknown = await call('GET', '/nope', { token });
  check('없는 경로 → 404 봉투', unknown.status === 404 && unknown.json?.success === false);

  const malformed = await call('POST', '/auth/login', { body: {}, raw: '{ not json' });
  check('깨진 JSON → 400', malformed.status === 400, `got ${malformed.status}`);
} catch (error) {
  failures.push(`unexpected exception: ${error?.stack ?? error}`);
}

// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log(`passed: ${passed}   failed: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  console.log('\nserver output:\n' + serverLog.join(''));
  shutdown(1);
}
console.log('CONTRACT TEST: PASS');
shutdown(0);
