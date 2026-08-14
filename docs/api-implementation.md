# API 구현 현황

> **이 파일은 리포가 소유하는 구현 추적 문서다.** `docs/backend/`는 Notion 명세의
> 미러라서 손으로 고치지 않지만, 이 파일은 구현이 바뀌는 PR에서 직접 갱신한다.
> 명세 원본: `docs/backend/api-spec.md` (최종 MVP API 14개). 계약 타입·경로 상수는
> `src/api/types.ts`, HTTP 클라이언트는 `src/api/client.ts`.

기준 시점: 일기 플로우 `feature/diary-flow` (2026-08-14).

## 범례

- ✅ 연동 — 앱 코드가 실제로 호출한다
- 🔧 함수만 — `client.ts`에 함수는 있으나 앱 쪽 호출자가 아직 없다
- ⬜ 미구현 — 클라이언트 함수도 없다 (요청/응답 타입은 전부 `types.ts`에 존재)

## 현황표

| # | 기능 | Method | Path | 상태 | 구현 위치 / 비고 |
| --- | --- | --- | --- | --- | --- |
| 1 | 로그인 (기능 13) | POST | `/auth/login` | ✅ | `client.ts` `login`. `walk-candidate-store`가 `EXPO_PUBLIC_MOCK_LOGIN_ID/PASSWORD` 있을 때 dev 자동 로그인, /debug에 수동 버튼. 로그인 화면 UI는 별도 태스크(팀 소유) |
| 2 | 내 정보 조회 (기능 13) | GET | `/users/me` | ⬜ | 마이페이지 단계에서 |
| 3 | 내 정보 수정 (기능 13) | PATCH | `/users/me` | ⬜ | 〃 (닉네임만) |
| 4 | 산책 후보 생성 (기능 1) | POST | `/walk-candidates` | ✅ | `client.ts` `createWalkCandidate`. 감지 플로우(`walk-candidate-store`)가 WalkEvent 수신 시 호출. 감지기가 **산책 종료를 판정한 뒤** 1회 발화하므로 POST 시점도 산책 종료 직후이고, 받은 candidateId를 SQLite `walks.candidateId`에 스탬핑. POST 실패 시에도 감지는 candidateId=null로 로컬 보존 |
| 5 | 산책 후보 조회 (기능 1) | GET | `/walk-candidates/{candidateId}` | ✅ | `client.ts` `getWalkCandidate`. `/walk` 진입 시 서버 상태를 재확인해 스테일 탭(이미 `RECORDING`/`SKIPPED`)을 판별하고 홈으로 되돌린다. 목록 API가 없어 서버 상태를 아는 유일한 경로 |
| 6 | 산책 후보 변경 (기능 1) | PATCH | `/walk-candidates/{candidateId}` | ✅ | `client.ts` `updateWalkCandidate`, 호출자는 전부 `walk-candidate-store`. ① 감지 직후 종료값(detectedEndAt·durationSeconds) ② `/walk` 진입 시 `SUGGESTED` ③ 남기기 `RECORDING`(종료값 없으면 동반 전송) ④ 건너뛰기 `SKIPPED` |
| 7 | 경험 초안 생성 (기능 2) | POST | `/walk-candidates/{candidateId}/experience-drafts` | ✅ | `client.ts` `createExperienceDraft`. `diary-flow-store`의 첫 generate()가 사용자가 설정한 입력만 담아 호출 (미입력 값은 생략 — 명세의 "서버가 임의로 생성하지 않는다") |
| 8 | 경험 초안 수정 (기능 2·3) | PATCH | `/experience-drafts/{draftId}` | ✅ | `client.ts` `updateExperienceDraft`. FAILED 재시도 전에 입력이 바뀐 경우에만 전체 현재값으로 호출 (emotions[] 전체 교체, null=제거) |
| 9 | AI 일기 생성 (기능 4) | POST | `/experience-drafts/{draftId}/ai-generation` | ✅ | `client.ts` `generateAiDiary`. 본문 없는 POST. FAILED → 같은 호출로 수동 재시도. `/debug` 강제 실패 토글만 mock의 `?fail=1`을 붙인다 (dev 전용) |
| 10 | 경험 확정 (기능 5) | POST | `/walk-experiences` | ✅ | `client.ts` `createWalkExperience`. 미리보기·수정 화면의 저장이 사용자 확정값(제목·본문·태그·감정 등)을 스냅샷으로 전송. SUCCESS 후의 입력 수정도 이 POST에 실린다 (draft는 SUCCESS에서 불변) |
| 11 | 아카이브 목록 (기능 6·12) | GET | `/walk-experiences` | ⬜ | from/to/tag 조합 규칙은 `types.ts` `isValidListQuery`에 선반영 |
| 12 | 상세 조회 (기능 7) | GET | `/walk-experiences/{experienceId}` | ✅ | `client.ts` `getWalkExperience`. `/experiences/[experienceId]` 상세 화면 (`experience-store`). 일기 플로우 완료가 여기로 랜딩 |
| 13 | 경험 수정 (기능 8) | PATCH | `/walk-experiences/{experienceId}` | ⬜ | title은 비울 수 없음. emotions/tags 전체 교체 |
| 14 | 경험 삭제 (기능 8) | DELETE | `/walk-experiences/{experienceId}` | ⬜ | Soft delete. 같은 Draft로 재생성 불가 |

서버 API가 **없는 것으로 명세가 확정**한 영역: 권한·자동 감지 ON/OFF·로컬 알림(기능 9),
상태 관리 전용 API(기능 10), 사진 선택(기능 11), 로그아웃(클라이언트 토큰 삭제, 기능 13).

## 구현에 반영된 클라이언트 계약 결정

- **HTTP 상태로만 분기**하고 `error.code`는 로그만 남긴다 (팀 결정 2026-08-12,
  근거는 `types.ts`의 `ApiFailure` 주석).
- 시각은 감지기의 epoch ms를 `toIsoDateTime`으로 ISO 8601로 변환해 보낸다.
- `emotions[]`/`tags[]`는 전체 교체 방식이며 집합으로 비교한다 (순서 비보장).
- 클라이언트는 실패한 요청을 **자동 재시도하지 않는다** (멱등 키 부재 — 아래 공백 5).

## 명세에서 확인된 공백과 처분 (공백 확인·처분 결정 모두 2026-08-13)

1. **산책 후보 목록 조회 API가 없다.** 단건 GET뿐이라 candidateId는 클라이언트가
   로컬 보관해야 하고, 로컬 데이터 유실 시 서버의 후보를 되찾을 수 없다.
   → **처분: 보류.** 후보는 스테이징 데이터고, 과거 후보를 탐색하는 제품 기능이
   없다. 그런 기능이 생기는 시점에 목록 API를 백엔드에 요청한다.
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
   → **처분: 모바일 MVP 통상 방안 채택.** 백엔드에는 "넉넉한 TTL, refresh 없음"
   명시만 요청. 클라이언트는 로그인 화면 태스크에서 토큰 영속화(iOS Keychain =
   expo-secure-store / web localStorage)와 401 시 토큰 폐기·재로그인 유도를
   구현한다. 현재는 메모리 보관 + dev env 자동 로그인.
5. **`POST /walk-candidates`에 멱등 키가 없다** — 같은 감지를 재전송하면 중복
   후보가 생긴다.
   → **처분: 무해 판정.** 후보는 스테이징 데이터라 중복이 생겨도 사용자에게
   보이지 않고(목록 API 없음) 아무것도 깨지지 않는다. 이 판정은 클라이언트가
   재시도하지 않는 동안에만 성립 — 재시도·유실 복구(reconcile)를 도입하는
   시점에 재고한다.
6. **예외별 HTTP 상태 매핑이 부분적이다** (명시된 것: 기능 5 중복 확정 409,
   목록 쿼리 조합 400, 인증 401, 소유권/부재 404 — 나머지는 mock의 자체 판단).
   → **처분: 인지 상태 유지.** 실백엔드 연결 시 mock과 대조한다.
7. **명세 문서가 Android 기준으로 서술돼 있다.** 실제 제출은 iOS 앱 + Web.
   → **처분: Notion 원본 수정 대상.** 기능 9 "Android / Web 배포 정책" 절
   (api-spec.md 903~925행)과 "기술 구현 단계에서 결정할 사항" 표의 "Android
   플러그인" 행(1320행)을 iOS 기준으로 고친다. API 계약 영향 없음.

## 갱신 규칙

- 엔드포인트의 연동 상태가 바뀌는 PR은 **같은 PR에서 이 표를 갱신**한다.
- 명세 자체가 바뀌면 Notion에서 `docs/backend/`를 재수출하고, 이 문서는 그 뒤에
  현황만 따라 고친다 (이 문서에 명세 내용을 복제하지 않는다).
