# API 구현 현황

> **이 파일은 리포가 소유하는 구현 추적 문서다.** `docs/backend/`는 Notion 명세의
> 미러라서 손으로 고치지 않지만, 이 파일은 구현이 바뀌는 PR에서 직접 갱신한다.
> 명세 원본: `docs/backend/api-spec.md` (최종 MVP API 14개). 계약 타입·경로 상수는
> `src/api/types.ts`, HTTP 클라이언트는 `src/api/client.ts`.

기준 시점: 옵저버 산책 reconcile `feature/observer-reconcile` (2026-08-15).
**14개 엔드포인트 전부 연동 완료.**

## 범례

- ✅ 연동 — 앱 코드가 실제로 호출한다
- 🔧 함수만 — `client.ts`에 함수는 있으나 앱 쪽 호출자가 아직 없다
- ⬜ 미구현 — 클라이언트 함수도 없다 (요청/응답 타입은 전부 `types.ts`에 존재)

## 현황표

| # | 기능 | Method | Path | 상태 | 구현 위치 / 비고 |
| --- | --- | --- | --- | --- | --- |
| 1 | 로그인 (기능 13) | POST | `/auth/login` | ✅ | `client.ts` `login` (유일하게 `{ public: true }` — 여기서의 401은 자격 오류지 세션 만료가 아니다). 호출자는 `auth-store.signIn`, 화면은 `/login`. `EXPO_PUBLIC_MOCK_*`는 더 이상 앱을 구동하지 않고 /debug 버튼과 `__DEV__` 폼 프리필 전용 |
| 2 | 내 정보 조회 (기능 13) | GET | `/users/me` | ✅ | `client.ts` `getMe`. `auth-store`가 ① 부팅 시 저장된 토큰 검증 ② 로그인 직후에 호출해 `user`를 채운다. 기록장 헤더는 그 값을 읽을 뿐 따로 요청하지 않는다. 실패해도 오류 화면 없이 "나의 기록장"으로 폴백 |
| 3 | 내 정보 수정 (기능 13) | PATCH | `/users/me` | ✅ | `client.ts` `updateMe`. `auth-store.updateNickname`이 호출, 화면은 `/settings` 프로필 카드. 빈 값·30자 초과는 왕복 없이 클라이언트가 거른다 |
| 4 | 산책 후보 생성 (기능 1) | POST | `/walk-candidates` | ✅ | `client.ts` `createWalkCandidate`. 감지 플로우(`walk-candidate-store`)가 WalkEvent 수신 시 호출. 감지기가 **산책 종료를 판정한 뒤** 1회 발화하므로 POST 시점도 산책 종료 직후이고, 받은 candidateId를 SQLite `walks.candidateId`에 스탬핑. POST 실패 시에도 감지는 candidateId=null로 로컬 보존. **호출자는 둘** — 실시간 감지 이벤트와, `/walk` 진입 시의 reconcile(옵저버가 잡았지만 JS 이벤트가 없던 산책을 `queryHistory`로 복구). 두 경로를 합쳐 **감지된 산책 하나당 POST는 최대 1회**이며 로컬 버퍼가 그 대장이다 (공백 5) |
| 5 | 산책 후보 조회 (기능 1) | GET | `/walk-candidates/{candidateId}` | ✅ | `client.ts` `getWalkCandidate`. `/walk` 진입 시 서버 상태를 재확인해 스테일 탭(이미 `RECORDING`/`SKIPPED`)을 판별하고 홈으로 되돌린다. 목록 API가 없어 서버 상태를 아는 유일한 경로 |
| 6 | 산책 후보 변경 (기능 1) | PATCH | `/walk-candidates/{candidateId}` | ✅ | `client.ts` `updateWalkCandidate`, 호출자는 전부 `walk-candidate-store`. ① 감지 직후 종료값(detectedEndAt·durationSeconds) ② `/walk` 진입 시 `SUGGESTED` ③ 남기기 `RECORDING`(종료값 없으면 동반 전송) ④ 건너뛰기 `SKIPPED` |
| 7 | 경험 초안 생성 (기능 2) | POST | `/walk-candidates/{candidateId}/experience-drafts` | ✅ | `client.ts` `createExperienceDraft`. `diary-flow-store`의 첫 generate()가 사용자가 설정한 입력만 담아 호출 (미입력 값은 생략 — 명세의 "서버가 임의로 생성하지 않는다") |
| 8 | 경험 초안 수정 (기능 2·3) | PATCH | `/experience-drafts/{draftId}` | ✅ | `client.ts` `updateExperienceDraft`. FAILED 재시도 전에 입력이 바뀐 경우에만 전체 현재값으로 호출 (emotions[] 전체 교체, null=제거) |
| 9 | AI 일기 생성 (기능 4) | POST | `/experience-drafts/{draftId}/ai-generation` | ✅ | `client.ts` `generateAiDiary`. 본문 없는 POST. FAILED → 같은 호출로 수동 재시도. `/debug` 강제 실패 토글만 mock의 `?fail=1`을 붙인다 (dev 전용) |
| 10 | 경험 확정 (기능 5) | POST | `/walk-experiences` | ✅ | `client.ts` `createWalkExperience`. 미리보기·수정 화면의 저장이 사용자 확정값(제목·본문·태그·감정 등)을 스냅샷으로 전송. SUCCESS 후의 입력 수정도 이 POST에 실린다 (draft는 SUCCESS에서 불변) |
| 11 | 아카이브 목록 (기능 6·12) | GET | `/walk-experiences` | ✅ | `client.ts` `listWalkExperiences(query)` — from/to/tag 전부 구현, 호출 전 `isValidListQuery`로 잘못된 조합을 왕복 없이 400 처리. 앱은 **쿼리 없이 전체 조회**만 사용하고 기간 탭은 클라이언트에서 KST로 거른다 (아래 공백 8 옆 처분). 호출자는 `experience-store.loadList`, 화면은 `/`(홈 스트립)·`/archive` |
| 12 | 상세 조회 (기능 7) | GET | `/walk-experiences/{experienceId}` | ✅ | `client.ts` `getWalkExperience`. `/experiences/[experienceId]` 상세 화면 (`experience-store`). 일기 플로우 완료가 여기로 랜딩 |
| 13 | 경험 수정 (기능 8) | PATCH | `/walk-experiences/{experienceId}` | ✅ | `client.ts` `updateWalkExperience`. 호출자는 `experience-store.updateExperience`, 화면은 `/experiences/[experienceId]`의 **인라인 수정 모드**(별도 라우트 없음). 명세가 허용하는 7개 필드를 모두 편집하며, `buildExperiencePatch`가 **바뀐 필드만** 담는다. title은 비울 수 없고 emotions/tags는 전체 교체 — 둘 다 **집합으로 비교**해 순서 변화를 변경으로 오인하지 않는다. 불변 4개 필드는 `UpdateWalkExperienceRequest`에 키가 없어 대입이 컴파일 에러다 |
| 14 | 경험 삭제 (기능 8) | DELETE | `/walk-experiences/{experienceId}` | ✅ | `client.ts` `deleteWalkExperience`. 호출자는 `experience-store.deleteExperience`, 화면은 상세의 삭제 확인 시트(`confirm-delete-sheet.tsx`). Soft delete라 이미 삭제된 건은 404이고 **클라이언트는 그 404를 성공으로 취급**한다(의도가 이미 달성됨). 같은 Draft로 재생성 불가는 서버 규칙이고 클라이언트에는 옛 draft를 재확정할 경로가 없다 |

서버 API가 **없는 것으로 명세가 확정**한 영역: 권한·자동 감지 ON/OFF·로컬 알림(기능 9),
상태 관리 전용 API(기능 10), 사진 선택(기능 11), 로그아웃(클라이언트 토큰 삭제, 기능 13).
**회원가입도 여기 속한다** — `api-spec.md` 기능 13이 "회원가입은 MVP에서 제외합니다"로
명시하고 사전 생성 계정을 쓴다. `/login`의 회원가입 링크는 폼 대신 안내만 띄운다.

이 영역들에도 이제 화면이 붙어 있다: `/settings`(프로필·닉네임·로그아웃),
`/settings/detection`(자동 감지 ON/OFF와 알림 발송 플래그 — 둘 다 네이티브
UserDefaults가 원본이고 `SecureStorePort`가 웹·첫 페인트용 사본을 든다),
`/settings/permissions`(어댑터에서 실시간으로 읽는 권한 상태). 전부 서버와 무관하다.

## 구현에 반영된 클라이언트 계약 결정

- **HTTP 상태로만 분기**하고 `error.code`는 로그만 남긴다 (팀 결정 2026-08-12,
  근거는 `types.ts`의 `ApiFailure` 주석).
- 시각은 감지기의 epoch ms를 `toIsoDateTime`으로 ISO 8601로 변환해 보낸다.
- `emotions[]`/`tags[]`는 전체 교체 방식이며 집합으로 비교한다 (순서 비보장).
- 클라이언트는 실패한 요청을 **자동 재시도하지 않는다** (멱등 키 부재 — 아래 공백 5).
- **기능 8의 PATCH는 변경된 필드만 보낸다** (`src/lib/experience-input.ts`
  `buildExperiencePatch`). 바뀐 게 없으면 요청 자체를 생략한다 — 명세에 빈 PATCH
  정의가 없어 실패만 가능한 왕복이기 때문이다. 생성(POST)의 "빈 배열은 생략"
  습관은 여기서 **뒤집힌다**: PATCH에서 `[]` 생략은 *유지*라서 감정을 전부
  해제하려면 `[]`를 명시해야 한다.
- **PATCH·DELETE의 응답 본문에 의존하지 않는다** (아래 공백 9). 200을 받으면
  *보낸 patch*를 `detail`과 캐시된 목록 행에 적용한다. 명세의 "생략=유지,
  전송=설정" 때문에 결과 레코드가 요청만으로 완전히 결정되고, patch에는 스냅샷
  컬럼 키가 아예 없어 불변 필드를 건드릴 수 없다. 재조회를 하지 않는 이유는
  홈·기록장이 마운트당 1회만 목록을 조회하기 때문 — 스토어 캐시를 직접 고쳐야
  삭제·수정이 즉시 반영된다.
- **DELETE의 404는 성공이다.** 명세상 이미 삭제된 건의 재삭제가 404이고,
  호출자의 의도("이건 없어야 한다")는 이미 충족돼 있다.

## 명세에서 확인된 공백과 처분 (공백 확인·처분 결정 모두 2026-08-13)

1. **산책 후보 목록 조회 API가 없다.** 단건 GET뿐이라 candidateId는 클라이언트가
   로컬 보관해야 하고, 로컬 데이터 유실 시 서버의 후보를 되찾을 수 없다.
   → **처분: 보류.** 후보는 스테이징 데이터고, 과거 후보를 탐색하는 제품 기능이
   없다. 그런 기능이 생기는 시점에 목록 API를 백엔드에 요청한다.
   **2026-08-15 보강**: 로컬 버퍼가 이제 reconcile의 대장이기도 하다. 버퍼가 비면
   서버 후보를 되찾지 못하는 것에 더해 "산책당 POST 1회" 보장까지 잃으므로,
   `reconcileFromHistory`는 버퍼를 열지 못하면 **실행을 거부**하고 로그만 남긴다.
2. **산책 종료값의 출처가 미정이었다.** 명세는 종료 판단을 클라이언트에 위임하고
   ("기술 구현 단계에서 결정할 사항"), 기능 5는 종료 시각·지속 시간 없는
   Candidate의 경험 확정을 거부한다.
   → **처분: 확정 (2026-08-13, PR B). 감지기가 종료를 판정하고 그 값을 이벤트에
   담아 보낸다.** 알림 발화 시점 자체를 바꿨다 — 예전에는 임계 30보 도달(산책
   초반)에 알렸으나, 유저플로우가 "걷기 종료 추정 → 기록 제안 Push 전송"이므로
   이제 **정지 180초 디바운스**로 종료를 확정한 뒤 1회 발화한다. 종료 시각은
   디바운스가 끝난 시각이 아니라 **실제로 멈춘 시각**(CMMotionActivity stationary
   행의 startDate)이고, `durationSeconds = round((종료 − 시작) / 1000)`이다.
   180초보다 짧은 정지(신호 대기 등)는 같은 산책으로 흡수된다.
   따라서 종료값은 후보 생성 직후 PATCH로 채워지고, `/walk` 진입 시 값이 비어
   있으면 한 번 더 보정한다. 종료값 없는 감지(웹·`emitTestEvent` 스텁)에 한해
   남기기 시각을 최후 폴백으로 쓰며, 어느 출처였는지 `endSource`로 로그에 남긴다.
   **실기기 실측(2026-08-14, 야외 보행 2건)**: 정지 → 약 180초 뒤 발화가 두 번 모두
   재현됐고(11:52:18→11:55:27 / 12:27:04→12:30:13), 짧은 멈춤 5회는 디바운스가
   흡수했으며, 지속 시간(408초·243초)에 대기 시간이 섞이지 않았다.
3. **`error.code` 어휘가 미공표다** (`INVALID_CREDENTIALS` 하나만 예시).
   → **처분: 비긴급.** HTTP 상태 분기로 동작 중. 공표되면 `types.ts`에 union 반영.
4. **토큰 정책이 없다** (만료·갱신 규정 부재, 401 시 동작 미정의).
   → **처분: 클라이언트에서 해소 완료** (`feature/auth-settings`). 백엔드에는
   "넉넉한 TTL, refresh 없음" 명시만 여전히 요청한다. 출하된 동작:
   - **영속화** — `SecureStorePort`(iOS 키체인 `AFTER_FIRST_UNLOCK` / web
     localStorage), 키 `mowa.auth.token.v1`.
   - **복원은 검증형** — 저장된 토큰으로 `GET /users/me`를 한 번 친다. 200이면
     로그인 상태, **401이면 폐기하고 로그아웃**, 그 외(네트워크·5xx)는 **세션을
     유지**한다. 네트워크 실패를 세션 실패로 취급하면 mock이 꺼진 평소 개발
     상태와 백엔드가 없는 배포 웹에서 사용자를 계속 튕겨내기 때문이다.
   - **401 처리는 `requestJson` 한 곳** — 토큰을 비우고 등록된 핸들러를 1회만
     호출한다(동시 401 N개도 1회). 화면은 401을 직접 알지 못하고, 루트
     레이아웃의 게이트가 `status`를 보고 `/onboarding`으로 보낸다.
   - **로그아웃 = 토큰 삭제 + 사용자 범위 스토어 리셋**. 서버 API는 없다(명세).
   - mock 토큰은 만료가 없어 401 경로가 자연 발생하지 않는다. /debug의
     "Plant bogus token (force 401)" 버튼이 재현 수단이다.
5. **`POST /walk-candidates`에 멱등 키가 없다** — 같은 감지를 재전송하면 중복
   후보가 생긴다.
   → **처분: 무해 판정 유지, 근거 교체 (2026-08-15, `feature/observer-reconcile`).**
   예고대로 reconcile을 도입했으므로 "클라이언트가 재시도하지 않는다"는 옛 근거는
   더 이상 성립하지 않는다. 대신 **불변식**으로 대체한다:

   > **감지된 산책 하나당 `POST /walk-candidates`는 영구히 최대 1회.**

   이를 지키는 장치 셋 —
   - **로컬 버퍼가 대장이다.** `isKnownLocally`가 후보 행을 `candidateId`가 null인
     것까지 **전부** 대조한다. 즉 POST가 실패한 감지는 **재시도하지 않는다**.
     의도적인 손실이다: 재시도는 "서버는 커밋됐는데 응답만 유실된" 경우 정확히
     중복을 만드는 동작이고, 그게 이 공백이 경고하던 바로 그 재시도다.
   - **중복 판정은 구간 겹침**이지 id 일치가 아니다. 실시간 경로는 180초 미만
     정지를 한 산책으로 흡수하지만 히스토리 조회는 non-walking 행마다 끊으므로
     한 산책이 여러 행으로 쪼개지고, `retro-<epochSec>`는 탭마다 안정적이지도 않다.
   - **single-flight.** 알림 탭이 `/walk`를 두 번 마운트하는 것이 실측돼 있어
     (2026-08-14) 동시 두 런이 각각 POST할 수 있었다. 모듈 스코프 프로미스로 묶었다.

   멱등 키가 생기면 이 장치들 대신 키를 쓰고 실패한 POST의 재시도를 열 수 있다.
6. **예외별 HTTP 상태 매핑이 부분적이다** (명시된 것: 기능 5 중복 확정 409,
   목록 쿼리 조합 400, 인증 401, 소유권/부재 404 — 나머지는 mock의 자체 판단).
   → **처분: 인지 상태 유지.** 실백엔드 연결 시 mock과 대조한다.
7. **명세 문서가 Android 기준으로 서술돼 있다.** 실제 제출은 iOS 앱 + Web.
   → **처분: Notion 원본 수정 대상.** 기능 9 "Android / Web 배포 정책" 절
   (api-spec.md 903~925행)과 "기술 구현 단계에서 결정할 사항" 표의 "Android
   플러그인" 행(1320행)을 iOS 기준으로 고친다. API 계약 영향 없음.
8. **목록 응답에 `durationSeconds`가 없다** (2026-08-14 확인). 기능 6 응답은 9개
   필드뿐이라 기록장 헤더의 "누적 시간"과 캘린더 날짜 칸의 분 표기를 계산할 수
   없다. 상세를 행 수만큼 조회해 합산하는 것은 왕복 비용이 커 채택하지 않았다.
   → **처분: 백엔드에 필드 추가 요청.** 그때까지 누적 시간은 `—`로 표시한다.
   `types.ts`의 `WalkExperienceListItem.durationSeconds`는 **선택 필드**로 선반영돼
   있고, 모든 행이 값을 가질 때만 합산하므로 백엔드가 내려주는 순간 자동으로 켜진다.
   mock은 기본적으로 명세 그대로(필드 없음) 응답하며, 합산 로직 검증용으로
   `MOCK_LIST_DURATION=1` 스위치를 둔다.
9. **기능 8의 PATCH·DELETE 응답 본문이 명세에 없다** (2026-08-15 확인).
   `api-spec.md` 기능 8은 두 요청의 Request만 규정하고 Response를 정의하지
   않는다. mock은 자체적으로 PATCH에 상세 뷰 전체를, DELETE에
   `{ experienceId, deletedAt }`를 돌려주지만 **그건 mock의 창작이지 계약이
   아니다.** 실백엔드가 `204 No Content`로 답하는 것이 "본문 없음"의 자연스러운
   해석인데, 그러면 envelope 파싱 실패가 되어 **성공한 저장이 전부 오류로
   보인다.**
   → **처분: 양방향 차단.** `client.ts`의 `requestJson`에 `bodyless` 옵션을 두어
   ① 2xx + 빈 본문/비-envelope를 성공으로 처리하고 ② 서버가 무엇을 보내든
   버려서 어떤 호출자도 본문에 의존할 수 없게 했다. 두 함수의 반환 타입이
   `ApiResult<null>`인 것이 그 계약의 타입 수준 선언이다. 실백엔드 연결 시
   실제 상태 코드를 확인하고, 확정되면 이 항목을 닫는다.

## reconcile이 구하지 못하는 산책 (2026-08-15)

옵저버 알림 탭은 이제 `queryHistory`로 산책을 되찾지만, 그 히스토리는
**CMMotionActivity**가 원본이다(`retrospectiveEvents`). HealthKit이 아니다.
그래서 다음은 구조적으로 복구되지 않는다. 데모에서 "알림을 눌렀는데 홈으로
튕겼다"가 나오면 아래 중 하나이며, 이제 `/debug`의 flow 로그에 이유가 남는다.

1. **CMMotionActivity가 `walking`으로 분류하지 못한 걷기** — 실내 보행, 러닝머신,
   가방·유모차·카트 안의 폰, 느린 걸음. 걸음 파이프라인이 동작 분류기보다 민감해서
   이 부류는 **옵저버를 확실히 발화시키고 reconcile은 확실히 빈손이다.** 남은 감지
   과제(C9)와 같은 뿌리이며, reconcile은 이걸 고치지 않는다.
2. **60초 미만 구간** — `retrospectiveEvents`가 하드코딩으로 버린다. 옵저버 기준은
   30보(≈20~25초)라, 발화는 시키지만 히스토리에는 안 보이는 대역이 존재한다.
3. **여러 조각으로 쪼개져 어느 조각도 60초를 못 넘는 산책** — 서고 가기를 반복하는
   쇼핑, 실내 복도.
4. **Apple Watch·타 앱이 기록한 걸음** — 폰 모션 코프로세서에 대응 기록이 없다.
5. **탭 시점에 아직 진행 중인 산책** — 닫힌 구간만 나온다.
6. **POST가 실패했던 감지** — 공백 5의 불변식에 따라 의도적으로 재시도하지 않는다.

**측정 방법.** Core의 `observer_steps total=… delta=…`(발화)와 새 로그
`reconcile: history rows=… window=… unknown=…`(복구 시도)가 분모와 분자다.
`healthkit-observer` 단독으로 하루 돌리면 실제 구제율이 숫자로 나온다 — 지금 이
문서에 비율을 적지 않는 이유는, 이 리포에 **옵저버 단독 알림의 실측이 아직 0건**이기
때문이다(기존 측정은 전부 실시간 계층이 살아 있어 옵저버가 중재로 억제됐다).

## 목록 필터 처분 (2026-08-14)

앱은 기간 탭(년/월/전체)을 **서버 쿼리가 아니라 클라이언트 필터**로 구현한다.
근거: MVP에 페이지네이션이 없고, 통계·홈 스트립·캘린더가 어차피 전체 목록을 필요로
하므로 필터용 재요청은 같은 결과를 얻는 중복 왕복이며 실패 경로만 하나 늘린다.
경계는 서버와 같은 Asia/Seoul 기준(`src/lib/kst.ts`)이라 결과가 일치한다.
기능 12의 년/월/일 → `from`/`to` 변환은 `kst.ts`에 실물로 있고, 서버 쿼리 경로는
`/debug` 섹션 8에서 직접 호출해 검증한다. 서버가 페이지네이션을 도입하면 화면이
`loadList`에 쿼리를 넘기도록 바꾼다.

## 갱신 규칙

- 엔드포인트의 연동 상태가 바뀌는 PR은 **같은 PR에서 이 표를 갱신**한다.
- 명세 자체가 바뀌면 Notion에서 `docs/backend/`를 재수출하고, 이 문서는 그 뒤에
  현황만 따라 고친다 (이 문서에 명세 내용을 복제하지 않는다).
