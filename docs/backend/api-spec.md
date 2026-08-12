# API 명세서

---

# 1. API 기본 정보

| 항목 | 내용 |
| --- | --- |
| 서비스명 | MOWA |
| API 형식 | REST API |
| 데이터 형식 | JSON |
| Base URL | `/api/v1` |
| 사용자 인증 | Access Token 기반 인증 |
| API 필드 표기 | JSON 필드는 camelCase 사용 |

MVP에서는 로그인 기반 사용자별 데이터 분리를 적용합니다.

회원가입은 MVP에서 제외하고 사전 생성된 테스트 계정을 사용합니다.

---

## 공통 인증 및 데이터 소유권 정책

인증이 필요한 API는 다음 Header를 사용합니다.

```
Authorization: Bearer {accessToken}
```

- `userId` 또는 `user_id`는 클라이언트 Request에서 전달받지 않습니다.
- 서버가 Access Token을 통해 로그인 사용자를 식별합니다.
- `walk_candidates`, `experience_drafts`, `walk_experiences`의 `user_id`는 서버가 로그인 사용자를 기준으로 설정합니다.
- 인증된 사용자는 자신의 데이터만 조회·수정·삭제할 수 있습니다.
- 다른 사용자가 소유한 `candidateId`, `draftId`, `experienceId`에 접근한 경우 일반 사용자에게 리소스 존재 여부를 노출하지 않고 `404 Not Found`로 처리합니다.
- Access Token이 없거나 유효하지 않은 경우 `401 Unauthorized`로 처리합니다.

---

# 2. 공통 응답 형식

## 성공 응답

```json
{
  "success": true,
  "message": "요청이 성공적으로 처리되었습니다.",
  "data": {}
}
```

## 실패 응답

```json
{
  "success": false,
  "message": "요청 처리 중 오류가 발생했습니다.",
  "error": {
    "code": "ERROR_CODE",
    "detail": "상세 오류 메시지"
  }
}
```

`success`, `message`, `error`는 API 공통 응답 필드이며 데이터 테이블의 저장 컬럼과는 별개입니다.

---

# 3. 공통 코드값

## Companion

| 코드 | 화면 표시 |
| --- | --- |
| `ALONE` | 혼자 |
| `WITH_SOMEONE` | 누군가와 |
| `PET` | 반려동물과 |

## Emotion

감정은 여러 개 선택할 수 있습니다.

| 코드 | 화면 표시 |
| --- | --- |
| `CALM` | 차분한 |
| `HAPPY` | 행복한 |
| `TIRED` | 피곤한 |
| `REFRESHED` | 상쾌한 |
| `PENSIVE` | 생각에 잠긴 |

동일한 감정을 하나의 `emotions[]` 배열에 중복 전달할 수 없습니다.

## Situation

| 코드 | 화면 표시 |
| --- | --- |
| `MORNING` | 아침 |
| `AFTERNOON` | 오후 |
| `EVENING` | 저녁 |
| `IN_TRANSIT` | 이동 중 |
| `EXPLORING` | 탐험 |

---

# 기능 1. 산책 후보 감지 및 기록 제안 API

걷기 활동 자체의 감지와 종료 판단은 기기 플러그인 및 클라이언트에서 수행하며, 백엔드는 감지 결과와 산책 후보 상태를 관리합니다.

| 기능 | Method | URL | 권한 | 설명 |
| --- | --- | --- | --- | --- |
| 산책 후보 생성 | POST | `/walk-candidates` | 필요 | 클라이언트가 감지한 걷기 활동을 산책 후보로 저장 |
| 산책 후보 조회 | GET | `/walk-candidates/{candidateId}` | 필요 | 기록 제안 또는 기록 진입에 필요한 Candidate 조회 |
| 산책 후보 정보·상태 변경 | PATCH | `/walk-candidates/{candidateId}` | 필요 | 종료 정보 갱신 및 상태 변경 |

---

## 산책 후보 생성

### Request

```json
{
  "detectedStartAt": "2026-08-12T13:00:00+09:00",
  "locationSummary": "망원동"
}
```

`locationSummary`는 선택값입니다.

### Response

```json
{
  "candidateId": "UUID",
  "detectedStartAt": "2026-08-12T13:00:00+09:00",
  "locationSummary": "망원동",
  "status": "DETECTED"
}
```

### 주요 예외

- 시작 시각 누락
- 잘못된 시각 형식

### 처리 정책

- 생성 시 기본 상태는 `DETECTED`입니다.
- `user_id`는 Request에서 받지 않고 Access Token 기준으로 서버가 설정합니다.

---

## 산책 후보 조회

### Path

```
candidateId
```

### Response

```
candidateId
detectedStartAt
detectedEndAt
durationSeconds
locationSummary
status
```

### 주요 예외

- 존재하지 않는 Candidate
- 다른 사용자가 소유한 Candidate

---

## 산책 후보 정보·상태 변경

### Request

다음 필드 중 변경할 항목만 전달합니다.

```
detectedEndAt
durationSeconds
locationSummary
status
```

### 주요 예외

- 존재하지 않는 Candidate
- 허용되지 않은 상태값
- 허용되지 않은 상태 전이
- 종료 시각 < 시작 시각
- 음수 지속 시간

---

## Candidate 상태 흐름

```
DETECTED
   ↓
SUGGESTED
   ├─ RECORDING  // 남기기
   └─ SKIPPED    // 건너뛰기
```

### 처리 정책

- `남기기` 선택 시 `RECORDING`으로 변경합니다.
- `건너뛰기` 선택 시 `SKIPPED`로 변경합니다.
- `RECORDING` 이후 Draft를 생성할 수 있습니다.
- 활동 감지와 시작·종료 판단은 클라이언트에서 수행합니다.
- Motion / Activity Recognition 자체를 서버 API로 구현하지 않습니다.

---

# 기능 2. 감정 중심 최소 경험 기록 API

사용자가 선택한 동반자·감정·상황 및 사진을 경험 초안에 저장합니다.

| 기능 | Method | URL | 권한 | 설명 |
| --- | --- | --- | --- | --- |
| 경험 초안 생성 | POST | `/walk-candidates/{candidateId}/experience-drafts` | 필요 | Candidate에 대한 Draft 생성 |
| 경험 초안 수정 | PATCH | `/experience-drafts/{draftId}` | 필요 | AI 생성 전 입력 수정 |

---

## 경험 초안 생성

### Request

```json
{
  "photoUrl": "https://...",
  "companion": "ALONE",
  "emotions": [
    "CALM",
    "PENSIVE"
  ],
  "situation": "AFTERNOON"
}
```

모든 사용자 입력값은 선택입니다.

### Response

```
draftId
candidateId
photoUrl
companion
emotions[]
situation
aiGenerationStatus
```

### 주요 예외

- 존재하지 않는 Candidate
- Candidate 상태가 `RECORDING`이 아님
- 이미 Draft가 존재하는 Candidate
- 허용되지 않은 `companion`
- 허용되지 않은 `emotion`
- 중복된 감정
- 허용되지 않은 `situation`

### 처리 정책

- `candidateId`는 `experience_drafts.candidate_id`의 `FK + UNIQUE`입니다.
- 하나의 Candidate에서는 최대 하나의 Draft만 생성할 수 있습니다.
- 사용자가 입력하지 않은 값은 서버가 임의로 생성하지 않습니다.
- 생성 시 `aiGenerationStatus = PENDING`입니다.
- `user_id`는 Access Token 기준으로 서버가 설정합니다.

---

## 경험 초안 수정

### Request

다음 필드 중 변경할 항목만 전달합니다.

```
photoUrl
companion
emotions[]
situation
```

### PATCH 배열 처리 규칙

`emotions[]`는 **부분 추가 방식이 아니라 전체 교체 방식**으로 처리합니다.

```
emotions 필드 생략
→ 기존 감정 유지

"emotions": []
→ 기존 감정 전체 제거

"emotions": ["CALM", "HAPPY"]
→ 기존 감정을 모두 제거하고 CALM, HAPPY로 교체
```

### Nullable 필드 처리

```
photoUrl 생략
→ 기존 사진 유지

"photoUrl": null
→ 기존 사진 제거

companion / situation 생략
→ 기존 값 유지

null 전달
→ 해당 값 제거
```

### 처리 정책

- Draft 수정은 `PENDING`, `FAILED` 상태에서만 허용합니다.
- `GENERATING`, `SUCCESS` 상태에서는 수정할 수 없습니다.

---

# 기능 3. 산책 사진 기록 API

## 별도 API 없음

사진 파일 자체를 백엔드 API로 업로드하지 않습니다.

### 처리 흐름

```
클라이언트
   ↓
Object Storage에 사진 업로드
   ↓
photoUrl 획득
   ↓
Draft 생성/수정 API에 photoUrl 전달
```

### 처리 정책

- 사진 파일은 Object Storage에 저장합니다.
- DB에는 `photoUrl`만 저장합니다.
- 사진 없이 기록할 수 있습니다.
- 기존 사진 제거 시 `photoUrl: null`을 사용합니다.
- PATCH에서 `photoUrl`을 생략하면 기존 사진을 유지합니다.
- 사진 파일 자동 삭제·정리는 MVP에서 구현하지 않습니다.

---

# 기능 4. AI 산책 일기 생성 API

Draft에 저장된 사용자 입력과 연결된 Candidate의 객관적 정보를 서버가 조회하여 OpenAI API를 호출합니다.

AI는 다음 결과를 생성합니다.

- 제목
- 본문
- 초기 추천 태그

| 기능 | Method | URL | 권한 |
| --- | --- | --- | --- |
| AI 산책 일기 생성 | POST | `/experience-drafts/{draftId}/ai-generation` | 필요 |

---

## AI 생성 Request

### Path

```
draftId
```

### Body

없음.

클라이언트가 AI 입력값을 다시 전달하지 않습니다.

---

## 서버 조회 데이터

### Draft

```
photoUrl
companion
emotions[]
situation
```

### Candidate

```
detectedStartAt
detectedEndAt
durationSeconds
locationSummary
```

---

## Response

```json
{
  "draftId": "UUID",
  "aiTitle": "오후 햇살 속 망원동 골목",
  "aiBody": "오늘 오후에는 망원동 골목을 천천히 걸었다...",
  "suggestedTags": [
    "오후산책",
    "망원동",
    "혼자",
    "생각에잠긴"
  ],
  "aiGenerationStatus": "SUCCESS"
}
```

---

## AI 생성 상태

```
PENDING
   ↓
GENERATING
   ├─ SUCCESS
   └─ FAILED
        ↓
      재시도 가능
```

### 처리 정책

- `PENDING`, `FAILED`에서만 생성 요청을 허용합니다.
- `GENERATING`, `SUCCESS`에서는 생성 요청을 허용하지 않습니다.
- 실패 시 자동 재시도하지 않습니다.
- `FAILED`에서는 동일 API를 통해 수동 재시도할 수 있습니다.
- 생성 시작 시 `GENERATING`으로 변경합니다.
- 성공 시 `aiTitle`, `aiBody`를 Draft에 저장하고 `SUCCESS`로 변경합니다.
- `SUCCESS` 상태에서는 `aiTitle`, `aiBody`가 모두 존재해야 합니다.
- 실패하면 `FAILED`로 변경합니다.
- 값이 없는 입력은 AI Prompt에서 제외합니다.
- 사용자에게 입력되지 않은 관계·감정·대화·사건을 AI가 임의로 확정하지 않도록 합니다.
- 사진만으로 사용자 감정이나 인물 관계를 확정하지 않습니다.

### 추천 태그 정책

- `suggestedTags`는 AI의 초기 추천값입니다.
- `suggestedTags`는 DB에 저장하지 않습니다.
- AI 생성 결과 중 DB에 저장되는 값은 `aiTitle`, `aiBody`입니다.
- 사용자가 추천 태그를 확인·수정한 후 최종 `tags[]`로 전달합니다.
- 최종 확정된 태그만 `walk_experience_tags`에 저장합니다.

---

# 기능 5. AI 일기 확인 및 산책 경험 확정 API

사용자가 AI 결과를 확인·수정한 최종 값을 WalkExperience에 Snapshot으로 저장합니다.

| 기능 | Method | URL | 권한 |
| --- | --- | --- | --- |
| 산책 경험 최종 저장 | POST | `/walk-experiences` | 필요 |

---

## Request

```json
{
  "draftId": "UUID",
  "title": "오후 햇살 속 망원동 골목",
  "body": "오늘 오후에는...",
  "photoUrl": "https://...",
  "companion": "ALONE",
  "emotions": [
    "CALM",
    "PENSIVE"
  ],
  "situation": "AFTERNOON",
  "tags": [
    "망원동",
    "오후산책",
    "혼자"
  ]
}
```

| 필드 | 필수 | 정책 |
| --- | --- | --- |
| `draftId` | 필수 | 출처 Draft |
| `title` | 필수 | 빈 문자열 불가, 최대 100자 |
| `body` | 선택 | NULL 허용 |
| `photoUrl` | 선택 | NULL 허용 |
| `companion` | 선택 | 허용 코드 사용 |
| `emotions[]` | 선택 | 다중 감정 |
| `situation` | 선택 | 허용 코드 사용 |
| `tags[]` | 선택 | 최종 확정 태그 |

---

## 태그 정책

- 한 Experience에는 최대 10개의 태그를 저장할 수 있습니다.
- 각 태그는 최대 50자입니다.
- 빈 문자열 또는 공백만 존재하는 태그는 허용하지 않습니다.
- 동일 Experience 안에서 중복 태그를 허용하지 않습니다.
- DB에는 `#` 없이 저장합니다.

예:

```
#망원동
→ DB 저장값: 망원동
```

---

## Candidate Snapshot

| Candidate | WalkExperience |
| --- | --- |
| `detectedStartAt` | `startedAt` |
| `detectedEndAt` | `endedAt` |
| `durationSeconds` | `durationSeconds` |
| `locationSummary` | `locationSummary` |

---

## Response

```
experienceId
draftId
createdAt
```

---

## 주요 예외

- 존재하지 않는 Draft
- 다른 사용자가 소유한 Draft
- Draft 상태가 `SUCCESS`가 아님
- 연결된 Candidate 없음
- Candidate의 종료 시각 누락
- Candidate의 지속 시간 누락
- title 누락
- 빈 title
- title 100자 초과
- 허용되지 않은 Companion / Emotion / Situation
- 중복 감정
- 태그 10개 초과
- 태그 50자 초과
- 빈 태그
- 중복 태그
- 동일 Draft로 이미 WalkExperience가 생성됨

---

## 저장 정책

- 하나의 Draft에서는 최대 하나의 WalkExperience만 생성합니다.
- 동일 `draftId`로 이미 생성되어 있으면 `409 Conflict`로 처리합니다.
- `walk_experiences.draft_id UNIQUE`를 최종 중복 방지 장치로 사용합니다.
- Soft Delete된 Experience도 DB에 유지되므로 동일 Draft에서 다시 생성할 수 없습니다.
- 별도 `finalizedAt` 컬럼은 사용하지 않습니다.
- `title`은 NOT NULL입니다.
- `body`는 NULL을 허용합니다.
- `emotions[]`는 `walk_experience_emotions`에 저장합니다.
- `tags[]`는 `walk_experience_tags`에 저장합니다.
- Candidate의 시간·장소 데이터는 Snapshot으로 저장합니다.
- 일반 조회 시 Draft나 Candidate에 의존하지 않습니다.
- 최종 Experience 생성 후 Draft는 삭제하지 않습니다.
- `user_id`는 Access Token 기준으로 서버가 설정합니다.

사용자가 최종 확인 화면에서 취소할 경우 이 API를 호출하지 않습니다.

---

# 기능 6. 감성 산책 아카이브 API

별도의 Archive 리소스나 테이블을 생성하지 않고 최종 WalkExperience 목록을 조회합니다.

| 기능 | Method | URL | 권한 |
| --- | --- | --- | --- |
| 산책 경험 목록 조회 | GET | `/walk-experiences` | 필요 |

---

## Query Parameter

```
from
to
tag
```

모두 선택값이지만 조합 규칙을 따릅니다.

---

## 조회 형태

### 전체 조회

```
GET /walk-experiences
```

### 기간 조회

```
GET /walk-experiences?from=2026-08-01&to=2026-08-31
```

### 태그 조회

```
GET /walk-experiences?tag=망원동
```

---

## Query 조합 규칙

```
Query 없음
→ 전체 조회

from + to
→ 기간 조회

tag
→ 태그 조회

from만 전달
→ 400 Bad Request

to만 전달
→ 400 Bad Request

from > to
→ 400 Bad Request

from/to + tag
→ 400 Bad Request
```

기간과 태그를 동시에 사용하는 복합 필터는 MVP에서 제공하지 않습니다.

---

## 날짜 기준

`from`, `to` 형식:

```
YYYY-MM-DD
```

캘린더 날짜는 **Asia/Seoul(KST) 기준**으로 처리합니다.

예:

```
from=2026-08-11
to=2026-08-11
```

개념적으로 다음 범위를 조회합니다.

```
2026-08-11 00:00:00 KST
<= startedAt
< 2026-08-12 00:00:00 KST
```

`to` 날짜 자체는 사용자 관점에서 포함됩니다.

---

## Response

```
experienceId
photoUrl
title
startedAt
locationSummary
companion
emotions[]
situation
tags[]
```

---

## 조회 정책

- 로그인한 사용자의 데이터만 조회합니다.
- `walk_experiences`, `walk_experience_emotions`, `walk_experience_tags`를 사용합니다.
- Draft와 Candidate를 JOIN하지 않습니다.
- `deletedAt IS NULL`인 Experience만 반환합니다.
- 기본 정렬은 `startedAt DESC`입니다.
- 데이터가 없으면 빈 배열을 반환합니다.
- MVP에서는 페이지네이션을 적용하지 않습니다.

---

# 기능 7. 산책 상세 조회 API

| 기능 | Method | URL | 권한 |
| --- | --- | --- | --- |
| 산책 경험 상세 조회 | GET | `/walk-experiences/{experienceId}` | 필요 |

## Response

```
experienceId
title
body
photoUrl
startedAt
endedAt
durationSeconds
locationSummary
companion
emotions[]
situation
tags[]
```

## 조회 정책

- WalkExperience의 Snapshot 데이터와 감정·태그 연결 테이블을 사용합니다.
- Draft와 Candidate를 JOIN하지 않습니다.
- Soft Delete된 Experience는 조회하지 않습니다.
- 존재하지 않거나 삭제되었거나 다른 사용자가 소유한 Experience는 `404 Not Found`로 처리합니다.

---

# 기능 8. 산책 기록 수정 및 삭제 API

| 기능 | Method | URL | 권한 |
| --- | --- | --- | --- |
| 산책 경험 수정 | PATCH | `/walk-experiences/{experienceId}` | 필요 |
| 산책 경험 삭제 | DELETE | `/walk-experiences/{experienceId}` | 필요 |

---

## 산책 경험 수정

### Request

다음 필드 중 변경 항목만 전달합니다.

```
title
body
photoUrl
companion
emotions[]
situation
tags[]
```

---

## PATCH 공통 처리 규칙

### 일반 필드

필드 생략:

```
→ 기존 값 유지
```

Nullable 필드에 `null` 전달:

```
→ 기존 값 제거
```

`title`은 null 또는 빈 문자열로 변경할 수 없습니다.

### emotions[]

```
emotions 생략
→ 기존 감정 유지

"emotions": []
→ 감정 전체 제거

"emotions": ["CALM", "HAPPY"]
→ 기존 감정을 모두 제거하고 새로운 배열로 전체 교체
```

### tags[]

```
tags 생략
→ 기존 태그 유지

"tags": []
→ 태그 전체 제거

"tags": ["망원동", "오후산책"]
→ 기존 태그를 모두 제거하고 새로운 배열로 전체 교체
```

`emotions[]`, `tags[]`는 부분 추가/삭제 API를 별도로 제공하지 않습니다.

---

## 수정할 수 없는 값

다음 값은 현재 MVP의 수정 범위에서 제외합니다.

```
startedAt
endedAt
durationSeconds
locationSummary
```

---

## 주요 예외

- 존재하지 않는 Experience
- Soft Delete된 Experience
- 다른 사용자가 소유한 Experience
- 빈 title
- title 100자 초과
- 허용되지 않은 Companion / Emotion / Situation
- 중복 Emotion
- 태그 최대 개수 초과
- 빈 태그
- 중복 태그
- 태그 길이 초과

---

## 삭제

DELETE 요청 시 실제 DB 행을 삭제하지 않습니다.

```
deletedAt = 현재 시각
```

### 처리 정책

- 삭제된 Experience는 목록·상세·수정 대상에서 제외합니다.
- 이미 삭제된 Experience의 상세·수정·재삭제 요청은 `404 Not Found`입니다.
- 복구 API는 MVP에서 제공하지 않습니다.
- Soft Delete 시 Object Storage 사진 파일은 자동 삭제하지 않습니다.

---

# 기능 9. 자동 감지·권한·알림 설정

## 별도 API 없음

| 기능 | 처리 위치 | 서버 API |
| --- | --- | --- |
| 활동 감지 권한 | OS / 클라이언트 | 없음 |
| 위치 권한 | OS / 클라이언트 | 없음 |
| 알림 권한 | OS / 클라이언트 | 없음 |
| 카메라 권한 | OS / 클라이언트 | 없음 |
| 사진 라이브러리 권한 | OS / 클라이언트 | 없음 |
| 자동 감지 ON/OFF | 클라이언트 | 없음 |
| 산책 기록 제안 알림 | 클라이언트 로컬 알림 | 없음 |

### 처리 정책

- 실제 OS 권한 상태를 서버 DB에 저장하지 않습니다.
- 자동 감지 ON/OFF는 클라이언트 로컬 설정으로 관리합니다.
- 설정 동기화는 MVP에서 제공하지 않습니다.
- 기록 제안 알림은 FCM/APNs 서버 Push가 아니라 기기 로컬 알림입니다.
- Push Token을 저장하지 않습니다.
- 권한 변경이 필요한 경우 OS 설정 화면으로 이동합니다.

---

## Android / Web 배포 정책

MVP 제출은 Android 앱과 Web 폴백을 함께 유지할 수 있습니다.

### Android 앱

- 플러그인 기반 위치·활동 감지
- OS 권한 처리
- 실제 산책 감지
- 기기 로컬 알림

### Web 폴백

- 로그인
- 산책 기록 작성/조회
- AI 일기 생성
- 캘린더 조회
- 태그 기반 그룹화
- 마이페이지

웹에서 지원하기 어려운 네이티브 산책 감지·로컬 알림 기능은 제한하거나 시연 영상으로 보완합니다.

Android와 Web은 동일한 백엔드 API와 데이터 구조를 사용하며 플랫폼별 별도 서버 API는 생성하지 않습니다.

---

# 기능 10. 산책 경험 데이터 상태 관리

## 별도 API 없음

기능 1·2·4·5 API를 통해 상태를 관리합니다.

### 전체 생명주기

```
walk_candidates

DETECTED
   ↓
SUGGESTED
   ├─ SKIPPED
   │
   └─ RECORDING
          ↓
   experience_drafts

      PENDING
         ↓
      GENERATING
      ├─ FAILED
      │    ↓
      │  재시도
      │
      └─ SUCCESS
             ↓
      walk_experiences
      최종 경험 생성
```

---

## 관계

```
walk_candidates
      │
      │ candidate_id
      │ FK + UNIQUE
      ▼
experience_drafts
      │
      │ draft_id
      │ FK + UNIQUE
      ▼
walk_experiences
```

### 처리 정책

- Candidate → Draft는 `candidate_id FK + UNIQUE`로 보장합니다.
- Draft → WalkExperience는 `draft_id FK + UNIQUE`로 보장합니다.
- 별도 상태 관리 테이블을 만들지 않습니다.
- Soft Delete된 Experience도 DB에 유지합니다.
- 최종 Experience와 연결된 Draft는 유지합니다.

---

# 기능 11. 최근 사진 선택

## 별도 API 없음

OS 사진 라이브러리에서 선택한 사진을 Object Storage에 업로드한 뒤 `photoUrl`을 Draft API로 전달합니다.

사진 없이 진행하거나 기존 사진을 제거하는 정책은 기능 3과 동일합니다.

---

# 기능 12. 캘린더 및 태그 기반 조회

## 별도 API 없음

기능 6의:

```
GET /walk-experiences
```

를 사용합니다.

### 기간 조회

```
GET /walk-experiences?from=2026-08-01&to=2026-08-31
```

### 태그 조회

```
GET /walk-experiences?tag=망원동
```

---

## 캘린더 처리

년·월·일 선택은 프론트엔드에서 `from`, `to`로 변환합니다.

예:

```
2026년
→ 2026-01-01 ~ 2026-12-31

2026년 8월
→ 2026-08-01 ~ 2026-08-31

2026년 8월 12일
→ 2026-08-12 ~ 2026-08-12
```

- 날짜 기준은 Asia/Seoul입니다.
- 별도 Calendar 테이블을 만들지 않습니다.
- `year`, `month`, `day` 컬럼도 생성하지 않습니다.
- `walk_experiences.started_at`을 기준으로 조회합니다.

---

## 태그 처리

- `tag`는 `walk_experience_tags.tag`와 일치하는 Experience를 조회합니다.
- 목록 Response에는 `tags[]`를 포함합니다.
- 별도의 `/search`, `/albums`, `/groups` API는 만들지 않습니다.
- 기존 `emotion`, `companion` Query Parameter 기반 필터는 제거합니다.

### 인덱스

```
walk_experiences(user_id, started_at)
```

복합 인덱스를 MVP 우선 인덱스로 사용합니다.

---

# 기능 13. 인증 및 마이페이지 API

로그인과 최소 마이페이지 기능을 제공합니다.

회원가입은 MVP에서 제외합니다.

| 기능 | Method | URL | 권한 |
| --- | --- | --- | --- |
| 로그인 | POST | `/auth/login` | 없음 |
| 내 정보 조회 | GET | `/users/me` | 필요 |
| 내 정보 수정 | PATCH | `/users/me` | 필요 |

---

## 로그인

### Request

```json
{
  "loginId": "mowa01",
  "password": "password"
}
```

`loginId`는 최대 50자입니다.

### Response

```json
{
  "success": true,
  "message": "로그인에 성공했습니다.",
  "data": {
    "accessToken": "..."
  }
}
```

### 주요 예외

존재하지 않는 ID와 비밀번호 불일치를 외부 응답에서 별도로 구분하지 않고 동일한 인증 실패로 처리합니다.

예:

```
INVALID_CREDENTIALS
```

---

## 내 정보 조회

```
GET /users/me
```

### Response

```json
{
  "userId": "UUID",
  "loginId": "mowa01",
  "nickname": "모아"
}
```

---

## 내 정보 수정

MVP에서는 닉네임만 수정할 수 있습니다.

```
PATCH /users/me
```

### Request

```json
{
  "nickname": "새로운닉네임"
}
```

### Validation

- nickname 필수
- 빈 문자열 불가
- 최대 30자
- 다른 사용자와 nickname 중복 허용

---

## 로그아웃

별도의:

```
POST /auth/logout
```

API를 생성하지 않습니다.

MVP에서는 Refresh Token을 별도로 관리하지 않고 클라이언트가 저장한 Access Token을 삭제하여 로그아웃합니다.

---

# API와 데이터 테이블 연결 요약

| API | 주요 테이블 | 주요 Read | 주요 Write |
| --- | --- | --- | --- |
| `POST /auth/login` | `users` | 인증 정보 | - |
| `GET /users/me` | `users` | 사용자 정보 | - |
| `PATCH /users/me` | `users` | 사용자 정보 | `nickname` |
| `POST /walk-candidates` | `walk_candidates` | - | 사용자, 시작 시각, 장소, 상태 |
| `GET /walk-candidates/{candidateId}` | `walk_candidates` | Candidate | - |
| `PATCH /walk-candidates/{candidateId}` | `walk_candidates` | Candidate | 종료 시각, 시간, 장소, 상태 |
| Draft 생성 | `experience_drafts`, `experience_draft_emotions` | Candidate 상태 | Draft 및 감정 |
| Draft 수정 | `experience_drafts`, `experience_draft_emotions` | Draft | 변경값 |
| AI 생성 | `experience_drafts`, `walk_candidates` | AI 입력 | AI 제목·본문·상태 |
| Experience 생성 | Draft, Candidate, Experience 및 감정·태그 테이블 | Draft/Candidate | Snapshot, 감정, 태그 |
| Experience 목록 | Experience 및 감정·태그 테이블 | 미삭제 Experience | - |
| Experience 상세 | Experience 및 감정·태그 테이블 | 미삭제 Experience | - |
| Experience 수정 | Experience 및 감정·태그 테이블 | 기존 Experience | 변경값 |
| Experience 삭제 | `walk_experiences` | 기존 Experience | `deleted_at` |

---

# 데이터 연동 세부 기준

API Validation 및 데이터 테이블 명세는 다음 기준으로 맞춥니다.

## users

```
id              UUID
login_id        VARCHAR(50) UNIQUE NOT NULL
password_hash   VARCHAR(255) NOT NULL
nickname        VARCHAR(30) NOT NULL
created_at      TIMESTAMPTZ NOT NULL
updated_at      TIMESTAMPTZ NOT NULL
```

- `login_id`만 UNIQUE입니다.
- `nickname`은 중복을 허용합니다.

## Draft 감정

```
experience_draft_emotions

PK (draft_id, emotion)
emotion VARCHAR(30) NOT NULL
```

별도 `id` PK를 생성하지 않습니다.

## Experience 감정

```
walk_experience_emotions

PK (experience_id, emotion)
emotion VARCHAR(30) NOT NULL
```

별도 `id` PK를 생성하지 않습니다.

## Experience 태그

```
walk_experience_tags

PK (experience_id, tag)
tag VARCHAR(50) NOT NULL
```

- 별도 `id` PK를 생성하지 않습니다.
- `#` 없이 저장합니다.
- 공백 태그를 허용하지 않습니다.
- 동일 Experience 안에서 중복 태그를 허용하지 않습니다.
- 한 Experience당 최대 10개의 태그를 허용합니다.

---

# 주요 정합성 규칙

- 하나의 Candidate에서는 최대 하나의 Draft만 생성합니다.
- 하나의 Draft에서는 최대 하나의 WalkExperience만 생성합니다.
- Soft Delete 후에도 동일 Draft에서 Experience를 재생성할 수 없습니다.
- 최종 Experience 일반 조회는 Draft와 Candidate에 의존하지 않습니다.
- AI의 `aiTitle`, `aiBody`는 Draft에 저장합니다.
- `suggestedTags`는 DB에 저장하지 않습니다.
- WalkExperience는 AI 상태가 `SUCCESS`인 Draft에서만 생성할 수 있습니다.
- `SUCCESS`에서는 `aiTitle`, `aiBody`가 모두 존재해야 합니다.
- 최종 `title`은 필수이며 최대 100자입니다.
- `body`는 선택이며 NULL을 허용합니다.
- Candidate의 시간·장소와 사용자 최종 확인값을 Snapshot으로 저장합니다.
- 사진 파일은 Object Storage에 저장하고 DB에는 URL만 저장합니다.
- 인증 API를 제외한 주요 리소스 API는 로그인 사용자의 데이터만 처리합니다.
- `user_id`는 Request에서 전달받지 않습니다.
- 감정은 연결 테이블을 이용하여 다중 값으로 관리합니다.
- 태그는 연결 테이블을 이용하여 다중 값으로 관리합니다.
- PATCH의 `emotions[]`, `tags[]`는 전체 교체 방식입니다.
- 삭제된 Experience는 일반 목록·상세·수정 대상에서 제외합니다.

---

# MVP 확정 API 정책

| 항목 | MVP 정책 |
| --- | --- |
| 인증 | Access Token |
| 회원가입 | 제외 |
| 로그아웃 | 클라이언트 Access Token 삭제 |
| 마이페이지 | 정보 조회 + 닉네임 수정 |
| 사용자 데이터 | 로그인 사용자별 분리 |
| 사진 | Object Storage 직접 업로드 |
| 제목 | 필수, 최대 100자 |
| 본문 | 선택 |
| 삭제 | Soft Delete |
| AI | OpenAI API |
| AI 재시도 | FAILED 상태에서 수동 재시도 |
| AI 자동 재시도 | 제외 |
| 추천 태그 저장 | 저장하지 않음 |
| 최종 태그 | 최대 10개, 각 50자 |
| 기본 정렬 | `startedAt DESC` |
| 날짜 조회 | `from` + `to` |
| 날짜 기준 | Asia/Seoul |
| 태그 조회 | `tag` |
| 날짜+태그 복합 필터 | 제외 |
| 감정/동반자 Query 필터 | 제거 |
| 페이지네이션 | 제외 |
| 자동 감지 | 클라이언트 플러그인 |
| 자동 감지 ON/OFF | 클라이언트 로컬 |
| 기록 제안 | 기기 로컬 알림 |
| 원격 Push | 제외 |
| Draft | Experience 생성 후 유지 |
| 사진 파일 자동 정리 | 제외 |
| Android/Web | 동일 Backend 사용 |

---

# 기술 구현 단계에서 결정할 사항

다음 항목은 API 계약을 변경하지 않으므로 구현 단계에서 결정합니다.

| 항목 | 설명 |
| --- | --- |
| OpenAI 모델 | 실제 일기·태그 추천에 사용할 모델 |
| Object Storage | S3, Supabase Storage 등 |
| Candidate 감지 임계값 | 최소 걷기 시간, 종료 판단 기준 |
| Android 플러그인 | 실제 위치·활동 감지에 사용할 Expo/Native 모듈 |

---

# 최종 MVP API 요약

| 기능 | Method | URL |
| --- | --- | --- |
| 로그인 | POST | `/auth/login` |
| 내 정보 조회 | GET | `/users/me` |
| 내 정보 수정 | PATCH | `/users/me` |
| 산책 후보 생성 | POST | `/walk-candidates` |
| 산책 후보 조회 | GET | `/walk-candidates/{candidateId}` |
| 산책 후보 정보·상태 변경 | PATCH | `/walk-candidates/{candidateId}` |
| 경험 초안 생성 | POST | `/walk-candidates/{candidateId}/experience-drafts` |
| 경험 초안 수정 | PATCH | `/experience-drafts/{draftId}` |
| AI 산책 일기 생성 | POST | `/experience-drafts/{draftId}/ai-generation` |
| 산책 경험 최종 저장 | POST | `/walk-experiences` |
| 산책 경험 목록/캘린더/태그 조회 | GET | `/walk-experiences` |
| 산책 경험 상세 조회 | GET | `/walk-experiences/{experienceId}` |
| 산책 경험 수정 | PATCH | `/walk-experiences/{experienceId}` |
| 산책 경험 삭제 | DELETE | `/walk-experiences/{experienceId}` |

총 **14개 API**입니다.

---

# 별도 API 없음

다음 기능은 독립된 백엔드 API를 생성하지 않습니다.

- 사진 파일 업로드
- OS 활동·위치·알림 권한
- 자동 걷기 감지
- 자동 감지 ON/OFF
- 기록 제안 로컬 알림
- 별도 상태 관리 API
- 최근 사진 선택
- 별도 캘린더 API
- 별도 검색 API
- 별도 Album / Group API
- 회원가입
- 로그아웃 API
- 원격 Push API

---

# 최종 서버 흐름

```
POST /auth/login
        ↓
Access Token
        ↓
클라이언트 플러그인 걷기 감지
        ↓
POST /walk-candidates
        ↓
PATCH /walk-candidates/{candidateId}
        ↓
기기 로컬 알림으로 기록 제안
        ↓
POST /walk-candidates/{candidateId}/experience-drafts
        ↓
PATCH /experience-drafts/{draftId}
        ↓
POST /experience-drafts/{draftId}/ai-generation
        ↓
OpenAI 생성 SUCCESS
        ↓
AI 제목·본문·추천 태그 반환
        ↓
사용자 확인·수정
        ↓
POST /walk-experiences
        ↓
GET /walk-experiences
        ├─ 전체
        ├─ from + to
        └─ tag
        ↓
GET /walk-experiences/{experienceId}
        ↓
PATCH / DELETE /walk-experiences/{experienceId}
```