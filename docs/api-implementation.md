# API 구현 현황

> **이 파일은 리포가 소유하는 구현 추적 문서다.** `docs/backend/`는 Notion 명세의
> 미러라서 손으로 고치지 않지만, 이 파일은 구현이 바뀌는 PR에서 직접 갱신한다.
> 명세 원본: `docs/backend/api-spec.md` (최종 MVP API 14개). 계약 타입·경로 상수는
> `src/api/types.ts`, HTTP 클라이언트는 `src/api/client.ts`.

기준 시점: PR A `feature/walk-candidate-flow` (2026-08-13).

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
| 4 | 산책 후보 생성 (기능 1) | POST | `/walk-candidates` | ✅ | `client.ts` `createWalkCandidate`. 감지 플로우(`walk-candidate-store`)가 WalkEvent 수신 시 호출, 받은 candidateId를 SQLite `walks.candidateId`에 스탬핑. POST 실패 시에도 감지는 candidateId=null로 로컬 보존 |
| 5 | 산책 후보 조회 (기능 1) | GET | `/walk-candidates/{candidateId}` | ⬜ | 검증에서 curl로만 사용. 후보 데이터는 로컬 보관이 1차라, PR B(제안 화면)에서 서버 재조회 필요성 판단 |
| 6 | 산책 후보 변경 (기능 1) | PATCH | `/walk-candidates/{candidateId}` | 🔧 | `client.ts` `updateWalkCandidate`. 호출자는 PR B — 제안 화면 진입 시 `SUGGESTED`, 남기기 `RECORDING`, 건너뛰기 `SKIPPED`, 종료값(detectedEndAt·durationSeconds) 갱신 |
| 7 | 경험 초안 생성 (기능 2) | POST | `/walk-candidates/{candidateId}/experience-drafts` | ⬜ | 일기 플로우 단계 |
| 8 | 경험 초안 수정 (기능 2·3) | PATCH | `/experience-drafts/{draftId}` | ⬜ | 〃. emotions[]는 전체 교체 |
| 9 | AI 일기 생성 (기능 4) | POST | `/experience-drafts/{draftId}/ai-generation` | ⬜ | 〃. 본문 없는 POST |
| 10 | 경험 확정 (기능 5) | POST | `/walk-experiences` | ⬜ | ⚠️ Candidate의 종료 시각·지속 시간 누락은 명세상 거부 — 종료값 PATCH가 선행돼야 한다 (아래 공백 2) |
| 11 | 아카이브 목록 (기능 6·12) | GET | `/walk-experiences` | ⬜ | from/to/tag 조합 규칙은 `types.ts` `isValidListQuery`에 선반영 |
| 12 | 상세 조회 (기능 7) | GET | `/walk-experiences/{experienceId}` | ⬜ | |
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
2. **산책 종료값의 출처가 미정이다.** 명세는 종료 판단을 클라이언트에 위임하고
   ("기술 구현 단계에서 결정할 사항"), 기능 5는 종료 시각·지속 시간 없는
   Candidate의 경험 확정을 거부한다. 감지기는 걷기 종료 시점에 JS로 아무 신호도
   주지 않는다 (임계 도달 시 1회 발화, `endedAtMs: null`).
   → **처분: API 계약 문제 아님 — PR B(제안 화면) 설계 때 클라이언트가 결정.**
   후보: 화면 진입/탭 시각 · CMPedometer 회고 행(정확한 start/end 보유) ·
   사용자 입력.
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
