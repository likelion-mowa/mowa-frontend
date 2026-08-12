# 8/10 회의 이후 백엔드 설계 변경사항 정리

## 0. 변경 배경

기존 기획에서는 산책 기록 목록을 중심으로 홈·캘린더·설정 화면이 분리되어 있었으나, 회의를 통해 서비스 구조와 MVP 범위가 변경되었습니다.

이번 변경은 단순 UI 수정이 아니라 다음 항목에 영향을 줍니다.

- API 명세서
- 데이터 테이블 명세서
- ERD
- IA 및 사용자 흐름
- 로그인 및 데이터 소유권
- AI 생성 데이터
- 감정 다중 선택
- 태그 기반 기록 그룹화
- 캘린더 조회

---

# 1. 서비스 기본 방향 변경

## 서비스명 확정

**MOWA**

- Moment + Walk
- ‘모으다’의 의미도 함께 포함
- 브랜드 스토리: **“걸으며 순간을 모으다”**

## 서비스 핵심 방향

> 사용자가 미처 인식하지 못한 산책을 자동으로 포착해 최소한의 기록을 남기고, AI가 당시의 사람·감정·장소 맥락을 하나의 경험으로 재구성해 다시 떠올릴 수 있도록 하는 서비스
> 

## MVP 기능

- 로그인
- 걷기 활동 탐지
- 산책 기록 제안 알림
- 산책 일기 작성
- AI 일기 생성
- 캘린더 기반 기록 조회
- 년·월·일 분류
- 태그 기반 기록 그룹화

---

# 2. 화면 및 IA 변경

## 기존 문제

기존 홈 화면과 캘린더 화면을 하단 메뉴바로 함께 배치하면서 두 화면의 기능이 중복되는 문제가 발생했습니다.

## 변경 방향

### 메인 화면 통합

기존 홈/캘린더 중심 구조를 정리하고 메인 화면에서 다음 기능을 제공합니다.

- 산책 기록하기
- 산책 기록 확인하기
- 걷기 감지 상태 표시
- 걷기 감지 전/후 캐릭터 변화
- 산책 기록 제안 인디케이터
- 설정 진입

걷기 상태에 따라 메인 캐릭터도 변경합니다.

```
걷기 감지 전
→ 서 있는 캐릭터

걷기 감지 후
→ 걷는 캐릭터
```

### 플로팅 바 적용

기존 고정 하단 메뉴바 대신 **페이지에 따라 내용이 달라지는 플로팅 바**를 사용합니다.

메인 화면에서는 홈 화면에 필요한 메뉴를 표시하고,

산책 기록 확인 화면에서는:

```
년
월
일
```

등 기록 조회 기준을 플로팅 바에서 선택할 수 있도록 합니다.

플로팅 바의 주요 메뉴는 다음과 같이 MVP 범위를 적용합니다.

- 홈 → MVP 포함
- 통계 → MVP 제외
- 기록장 → MVP 포함
- 마이페이지 → MVP 포함

---

# 3. 최종 사용자 흐름

```
앱 시작
    ↓
인증 여부 확인
    ↓
미인증
    ↓
로그인
    ↓
MOWA 메인 화면
    │
    ├─ 산책 자동 감지 및 기록
    │
    ├─ 산책 기록 확인하기
    │      ├─ 년
    │      ├─ 월
    │      ├─ 일
    │      └─ 태그 기반 그룹
    │
    ├─ 마이페이지
    │      ├─ 내 정보 조회
    │      ├─ 닉네임 수정
    │      └─ 로그아웃
    │
    └─ 설정
```

---

# 4. 산책 감지 및 알림 방식 확정

## 산책 감지

기기 플러그인을 이용하여 필요한 위치 및 활동 관련 권한을 획득합니다.

```
기기 위치·활동 권한 획득
        ↓
플러그인을 이용한 걷기 활동 감지
        ↓
클라이언트에서 걷기 시작·종료 판단
        ↓
POST /walk-candidates
PATCH /walk-candidates/{candidateId}
        ↓
서버에 Candidate 저장
```

### 책임 분리

**클라이언트 / 기기 플러그인**

- 위치 및 활동 권한
- 걷기 활동 감지
- 걷기 시작·종료 판단
- 기록 제안 조건 판단
- 로컬 알림

**백엔드**

- 감지 결과 저장
- Candidate 상태 관리
- Draft 및 Experience 관리
- OpenAI API 호출
- 기록 조회

따라서 기존 핵심 구조는 유지합니다.

```
Candidate
→ Draft
→ WalkExperience
```

메인 화면의 `산책 기록하기`는 **감지된 Candidate를 기반으로 기록을 남기는 흐름으로 진입하는 기능**으로 처리합니다.

---

## 산책 기록 제안 알림

기기 알림 플러그인을 이용한 **로컬 알림**으로 확정합니다.

```
걷기 종료 감지
    ↓
기록 제안 조건 충족
    ↓
기기 알림 권한 확인
    ↓
로컬 알림 표시
    ↓
사용자 기록 화면 진입
```

따라서 MVP에서는 다음 기능을 추가하지 않습니다.

- FCM / APNs 서버 Push
- Push Token 저장
- `device_token` 테이블
- 별도 알림 API

기획 문서에서 `Push 알림`이라고 표현되어 있다면 구현 방식의 혼동을 막기 위해 **`산책 기록 제안 로컬 알림`**로 표현하는 것을 권장합니다.

---

# 5. 로그인 및 사용자 구조 추가

기존의 **로그인 없는 단일 사용자 MVP 정책은 폐기**합니다.

## users 테이블 추가

```
users

- id
- login_id
- password_hash
- nickname
- created_at
- updated_at
```

회원가입까지 구현하면 범위가 커지므로 MVP에서는 **테스트 계정을 미리 생성하고 로그인만 구현하는 방향**을 우선 사용합니다.

`users` 테이블은 로그인 인증뿐만 아니라 마이페이지의 사용자 정보 조회 및 닉네임 수정에도 사용합니다.

## 기존 데이터에 사용자 소유권 추가

다음 테이블에 `user_id`를 연결합니다.

```
walk_candidates.user_id
experience_drafts.user_id
walk_experiences.user_id
```

`user_id`는:

```
FK
NOT NULL
```

로 관리합니다.

이후 모든 산책 데이터 API는 **로그인한 사용자의 데이터만 조회·수정**하도록 합니다.

---

# 6. 최소 경험 입력값 변경

기존:

```
동반자
감정
상황
한마디
```

에서 새로운 프로토타입 기준:

```
동반자
↓
감정
↓
상황
↓
AI 일기 생성
↓
태그 확인·수정
```

으로 변경합니다.

---

## Companion 변경

기존:

```
ALONE
FRIEND
PARTNER
FAMILY
PET
```

변경:

| 코드 | 화면 표시 |
| --- | --- |
| `ALONE` | 혼자 |
| `WITH_SOMEONE` | 누군가와 |
| `PET` | 반려동물과 |

`experience_drafts`, `walk_experiences`의 CHECK 제약조건도 동일하게 수정합니다.

---

## Emotion 변경 및 다중 선택

새 프로토타입에서는 감정을 **여러 개 선택할 수 있습니다.**

허용값:

| 코드 | 화면 표시 |
| --- | --- |
| `CALM` | 차분한 |
| `HAPPY` | 행복한 |
| `TIRED` | 피곤한 |
| `REFRESHED` | 상쾌한 |
| `PENSIVE` | 생각에 잠긴 |

따라서 기존:

```
emotion VARCHAR(30)
```

단일 컬럼 방식은 제거합니다.

### Draft 감정

```
experience_draft_emotions

draft_id       FK, NOT NULL
emotion        VARCHAR(30), NOT NULL
```

동일 Draft에서 같은 감정이 중복 저장되지 않도록:

```
UNIQUE(draft_id, emotion)
```

을 적용합니다.

### 최종 Experience 감정

```
walk_experience_emotions

experience_id  FK, NOT NULL
emotion        VARCHAR(30), NOT NULL
```

```
UNIQUE(experience_id, emotion)
```

을 적용합니다.

API에서는 기존:

```
emotion
```

대신:

```
emotions[]
```

배열로 처리합니다.

---

## Situation 변경

허용값을 새 프로토타입에 맞게 변경합니다.

| 코드 | 화면 표시 |
| --- | --- |
| `MORNING` | 아침 |
| `AFTERNOON` | 오후 |
| `EVENING` | 저녁 |
| `IN_TRANSIT` | 이동 중 |
| `EXPLORING` | 탐험 |

컬럼명 `situation`은 그대로 유지합니다.

---

## note 제거

새 프로토타입에서는 기존 `한마디` 입력 과정이 사용되지 않으므로 다음 컬럼과 API 필드를 제거합니다.

```
experience_drafts.note
walk_experiences.note
```

API Request / Response에서도 `note`를 제거합니다.

---

# 7. OpenAI 기반 일기 및 태그 추천

지급받은 OpenAI API 크레딧을 사용하여 **백엔드 서버에서 OpenAI API를 호출**합니다.

기존 Endpoint는 유지합니다.

```
POST /experience-drafts/{draftId}/ai-generation
```

## AI 입력 정보

- 사진
- 동반자
- 감정 목록
- 상황
- 산책 시작·종료 시간
- 산책 지속 시간
- 장소

## AI 결과

- 일기 제목
- 일기 본문
- 추천 태그

예시:

```json
{
  "draftId": "...",
  "aiTitle": "오후 햇살 속 망원동 골목",
  "aiBody": "...",
  "suggestedTags": [
    "오후산책",
    "망원동",
    "골목",
    "혼자",
    "생각에잠긴"
  ],
  "aiGenerationStatus": "SUCCESS"
}
```

`suggestedTags`는 **AI 추천 결과일 뿐 최종 태그가 아닙니다.**

---

# 8. AI 추천과 최종 그룹화 구분

태그 처리 흐름은 다음과 같이 확정합니다.

```
OpenAI
→ 제목·본문·초기 태그 추천
        ↓
사용자 미리보기
        ↓
제목·본문·태그 수정
        ↓
최종 WalkExperience 저장
        ↓
최종 태그 기준 그룹화
```

중요한 점은 **그룹화 단계에서는 OpenAI를 다시 호출하지 않는다는 것**입니다.

최종적으로 저장된 동일한 태그를 기준으로 기록을 규칙 기반으로 묶습니다.

---

# 9. 태그 데이터 구조 추가

하나의 산책 경험에 여러 태그가 존재할 수 있으므로 별도 테이블을 추가합니다.

```
walk_experience_tags

experience_id  FK, NOT NULL
tag            VARCHAR(...), NOT NULL
```

동일 산책에 같은 태그가 중복 저장되지 않도록:

```
UNIQUE(experience_id, tag)
```

을 적용합니다.

DB에는:

```
망원동
혼자
오후산책
```

처럼 `#` 없이 저장합니다.

프론트에서만:

```
#망원동
#혼자
#오후산책
```

형태로 표시합니다.

---

# 10. 별도 Album 테이블은 생성하지 않음

MVP에서는 별도의:

```
albums
album_experiences
```

등의 테이블을 생성하지 않습니다.

예를 들어:

```
#망원동
├─ Experience 1
├─ Experience 3
└─ Experience 5
```

처럼 `walk_experience_tags`의 동일 태그를 기준으로 기록을 그룹화합니다.

---

# 11. API Request 구조 변경

## Draft 생성/수정

기존:

```json
{
  "photoUrl": "...",
  "companion": "ALONE",
  "emotion": "CALM",
  "situation": "...",
  "note": "..."
}
```

변경:

```json
{
  "photoUrl": "...",
  "companion": "ALONE",
  "emotions": [
    "CALM",
    "PENSIVE"
  ],
  "situation": "AFTERNOON"
}
```

변경사항:

```
emotion → emotions[]
note → 제거
```

---

# 12. WalkExperience 저장 API 변경

기존:

```
draftId
title
body
photoUrl
companion
emotion
situation
note
```

변경:

```
draftId
title
body
photoUrl
companion
emotions[]
situation
tags[]
```

Endpoint는 유지합니다.

```
POST /walk-experiences
```

### Snapshot 기준

Candidate에서:

- 시작 시각
- 종료 시각
- 지속 시간
- 장소

사용자 최종 확인값에서:

- 제목
- 본문
- 사진
- 동반자
- 감정 목록
- 상황
- 태그

를 최종 Experience에 저장합니다.

---

# 13. 상세 및 수정 API 변경

다음 API도 새로운 구조를 사용합니다.

```
GET /walk-experiences/{experienceId}

PATCH /walk-experiences/{experienceId}
```

기존:

```
emotion
note
```

대신:

```
emotions[]
tags[]
```

를 Request / Response에 포함합니다.

---

# 14. 캘린더 조회 추가

기존에는 캘린더 기반 조회가 MVP에서 제외되어 있었으나 이번 MVP에 포함합니다.

별도의 Calendar 테이블은 만들지 않고 기존:

```
GET /walk-experiences
```

Endpoint를 활용합니다.

예:

```
GET /walk-experiences?from=2026-08-01&to=2026-08-31
```

### 년 조회

```
2026년
→ 2026-01-01 ~ 2026-12-31
```

### 월 조회

```
2026년 8월
→ 2026-08-01 ~ 2026-08-31
```

### 일 조회

```
2026년 8월 11일
→ 해당 날짜 범위
```

프론트에서 선택한 년·월·일을 `from`, `to` 범위로 변환하여 요청합니다.

DB에는 별도의:

```
year
month
day
```

컬럼을 추가하지 않습니다.

---

# 15. 태그 기반 조회 추가

기존 감정·동반자 중심 필터를 태그 중심 그룹화로 변경합니다.

```
GET /walk-experiences?tag=망원동
```

목록 Response에는 각 Experience의 태그 목록도 포함합니다.

```
tags[]
```

별도의:

```
/search
/albums
/groups
```

Endpoint는 MVP에서 만들지 않습니다.

---

# 16. WalkExperience 인덱스 변경

로그인과 캘린더 조회가 추가되므로 기존 단일:

```
started_at
```

인덱스 대신 사용자별 날짜 조회를 고려하여:

```
(user_id, started_at)
```

복합 인덱스를 MVP 우선 인덱스로 사용합니다.

---

# 17. 인증 및 마이페이지 API

```
로그인

```http
POST /auth/login
```

요청:

```
{
  "loginId":"mowa01",
  "password":"password"
}
```

로그인 성공 시 Access Token을 반환하고 이후 인증이 필요한 API에서 사용합니다.

```
Authorization: Bearer {accessToken}
```

## 내 정보 조회

```
GET /users/me
```

응답 예시:

```
{
  "userId":"...",
  "loginId":"mowa01",
  "nickname":"모아"
}
```

## 내 정보 수정

MVP에서는 닉네임 수정만 지원합니다.

```
PATCH /users/me
```

요청 예시:

```
{
  "nickname":"새로운닉네임"
}
```

## 로그아웃

MVP에서는 Refresh Token을 별도로 관리하지 않고 클라이언트가 보관한 Access Token을 삭제하여 로그아웃 처리합니다.

따라서 별도의 `/auth/logout` API는 생성하지 않습니다.

```

이렇게 하면 API 명세서를 수정하는 팀원도 **추가해야 하는 API가 정확히 3개라는 것**을 바로 알 수 있습니다.

```text
POST  /auth/login
GET   /users/me
PATCH /users/me
```

---

# 18. ERD 변경

기존 3개 테이블 ERD:

```
walk_candidates
        ↓
experience_drafts
        ↓
walk_experiences
```

에서 다음 구조로 확장합니다.

```
users
  │
  ├── walk_candidates
  ├── experience_drafts
  └── walk_experiences

walk_candidates
      │
      │ 1 : 0..1
      ▼
experience_drafts
      │
      ├── experience_draft_emotions
      │
      │ 1 : 0..1
      ▼
walk_experiences
      │
      ├── walk_experience_emotions
      └── walk_experience_tags
```

`users`는 산책 데이터의 소유자를 구분하는 기준 테이블이면서 로그인 및 마이페이지 사용자 정보의 기준 테이블로 사용합니다.

마이페이지를 위한 별도 테이블은 생성하지 않습니다.

기존:

```
Candidate → Draft
Draft → WalkExperience
```

의 `FK + UNIQUE` 관계와 Soft Delete 정책은 그대로 유지합니다.

---

# 19. API / DB 변경이 필요 없는 UI 변경

다음 변경사항은 프론트엔드 및 IA에서 처리하며 별도 백엔드 API나 테이블을 추가하지 않습니다.

- 메인 화면 단일화
- 기존 하단 메뉴바 제거
- 페이지별 플로팅 바
- 걷기 감지 전/후 캐릭터 변경
- 기록 제안 인디케이터
- 설정 버튼 위치 변경
- 서비스명 MOWA 적용

---

# 20. MVP 포함 / 제외 및 별도 구조 미사용 항목

## 20.1 MVP에 포함되는 기능

다음 기능은 현재 해커톤 MVP 범위에 포함합니다.

- 로그인
- 마이페이지
    - 내 정보 조회
    - 닉네임 수정
    - 로그아웃
- 플러그인 기반 걷기 활동 감지
- 산책 기록 제안 로컬 알림
- 산책 경험 입력
    - 동반자 선택
    - 감정 다중 선택
    - 상황 선택
- 사진 기록
- OpenAI API 기반 산책 일기 생성
- AI 기반 초기 태그 추천
- 사용자 제목·본문·태그 확인 및 수정
- 최종 산책 경험 저장
- 산책 기록 상세 조회 및 수정·삭제
- 캘린더 기반 기록 조회
- 년·월·일 기준 기록 분류
- 최종 태그를 이용한 앨범형 기록 그룹화

---

## 20.2 MVP에서 제외하는 기능

다음 기능은 현재 MVP 범위에서는 구현하지 않습니다.

### 통계 기능

플로팅 바에 통계 메뉴가 표시될 수 있으나 현재 MVP 기능에서는 실제 통계 집계 API 및 통계 화면 구현을 제외합니다.

### 회원가입

MVP에서는 로그인 기능만 구현하며 사전에 생성된 테스트 계정을 사용합니다.

### 마이페이지 확장 기능

마이페이지 자체는 MVP에 포함하지만 다음 기능은 제외합니다.

- 프로필 이미지 등록·수정
- 비밀번호 변경
- 계정 탈퇴
- 로그인 이력
- 상세 계정 설정

### AI를 이용한 재그룹화

OpenAI는 산책 일기와 초기 태그 추천에 사용합니다.

최종 저장된 산책 기록의 그룹화 단계에서는 OpenAI를 다시 호출하지 않고 최종 태그 일치 여부를 기준으로 규칙 기반 그룹화를 수행합니다.

### FCM / APNs 기반 서버 Push

산책 기록 제안 알림은 기기 플러그인을 이용한 로컬 알림으로 구현하므로 서버 원격 Push는 사용하지 않습니다.

---

## 20.3 기능은 구현하지만 별도 서버 구조를 만들지 않는 항목

### 앨범형 그룹

태그를 기준으로 산책 기록을 앨범처럼 묶어 보여주는 기능은 MVP에 포함합니다.

단, 별도의 `albums`, `album_experiences` 테이블은 생성하지 않고 `walk_experience_tags`의 최종 태그를 기준으로 그룹화합니다.

### 산책 기록 제안 알림

산책 기록 제안 알림은 MVP에 포함하지만 기기 로컬 알림으로 처리하므로 다음 서버 구조는 생성하지 않습니다.

- Push Token 저장
- `device_token` 테이블
- 별도 알림 테이블
- 알림 발송 API
- FCM / APNs 서버 연동

### 년·월·일 캘린더 분류

년·월·일 기준 기록 조회는 MVP에 포함하지만 DB에 `year`, `month`, `day` 컬럼을 별도로 저장하지 않습니다.

`walk_experiences.started_at`을 기준으로 기간 조회합니다.

### 감정·동반자 탐색

기존 `emotion`, `companion` Query Parameter 기반 필터는 제거하고 최종 태그를 이용한 탐색 및 그룹화로 통합합니다.

---

## 20.4 추후 확장 가능 기능

- 통계 화면 및 통계 API
- 회원가입
- 프로필 이미지 관리
- 비밀번호 변경
- 계정 탈퇴
- 원격 Push 알림
- 알림 이력 관리
- 별도 앨범 생성·수정·삭제
- AI 기반 자동 앨범 재분류
- 페이지네이션 및 고급 검색

---

# 21. 최종 핵심 데이터 흐름

```
로그인
    ↓
기기 위치·활동 권한
    ↓
걷기 자동 감지
    ↓
WalkCandidate 생성·갱신
    ↓
걷기 종료
    ↓
로컬 알림으로 기록 제안
    ↓
사용자 기록 진입
    ↓
동반자 선택
    ↓
감정 다중 선택
    ↓
상황 선택
    ↓
ExperienceDraft 저장
    ↓
백엔드 OpenAI API 호출
    ↓
AI 제목 + 본문 + 태그 추천
    ↓
사용자 미리보기·수정
    ↓
WalkExperience 최종 저장
    ↓
캘린더 년·월·일 조회
    또는
태그 기반 기록 그룹 조회
```

---

# 22. 팀원 작업 시 수정해야 할 문서

```markdown

## 데이터 테이블 명세서

반영 필요:

- `users` 테이블 추가
  - 로그인 인증 및 마이페이지 사용자 정보의 기준 테이블로 사용
  - `id`
  - `login_id`
  - `password_hash`
  - `nickname`
  - `created_at`
  - `updated_at`
- `walk_candidates`, `experience_drafts`, `walk_experiences`에 `user_id` 추가
- `user_id`를 통해 사용자별 데이터 소유권 구분
- Companion 허용값 변경
  - `ALONE`
  - `WITH_SOMEONE`
  - `PET`
- 기존 단일 `emotion` 컬럼 제거
- `experience_draft_emotions` 추가
- `walk_experience_emotions` 추가
- Emotion 허용값 변경
  - `CALM`
  - `HAPPY`
  - `TIRED`
  - `REFRESHED`
  - `PENSIVE`
- Situation 허용값 변경
  - `MORNING`
  - `AFTERNOON`
  - `EVENING`
  - `IN_TRANSIT`
  - `EXPLORING`
- 기존 `note` 제거
- `walk_experience_tags` 추가
- 동일 경험 내 중복 감정 및 태그 방지를 위한 `UNIQUE` 제약조건 반영
- 사용자별 날짜 조회를 위한 `(user_id, started_at)` 인덱스 반영
- 기존 `Candidate → Draft → WalkExperience`의 `FK + UNIQUE` 관계 유지
- 기존 WalkExperience Soft Delete 정책 유지
- 별도의 Album, 알림, Push Token, year/month/day 테이블·컬럼은 추가하지 않음

---

## API 명세서

반영 필요:

### 인증 및 마이페이지

- `POST /auth/login` 추가
- Access Token 기반 인증 적용
- 기존 주요 API는 인증된 사용자의 데이터만 처리
- `GET /users/me` 추가
- `PATCH /users/me` 추가
- 마이페이지에서는 내 정보 조회 및 닉네임 수정 지원
- 로그아웃은 클라이언트의 Access Token 삭제 방식으로 처리
- 별도 `/auth/logout` API는 생성하지 않음
- 회원가입은 MVP에서 제외하고 사전 생성된 테스트 계정 사용

### 산책 기록

- Draft 생성·수정 API의 `emotion`을 `emotions[]`로 변경
- 기존 `note` 필드 제거
- WalkExperience 생성·조회·수정 API에 `emotions[]` 반영
- WalkExperience 생성·조회·수정 API에 `tags[]` 추가
- 기존 Candidate 생성·수정 API는 유지
- 산책 감지 자체는 클라이언트 플러그인에서 수행하고 서버는 감지 결과만 저장

### AI 생성

- 백엔드 서버에서 OpenAI API 호출
- 기존 `POST /experience-drafts/{draftId}/ai-generation` 유지
- AI 생성 결과에 제목, 본문, 초기 추천 태그 포함
- Response에 `suggestedTags` 추가
- AI 추천 태그는 사용자가 확인·수정 후 최종 `tags[]`로 저장
- 최종 기록 그룹화 단계에서는 OpenAI를 다시 호출하지 않음

### 캘린더 및 태그 조회

- 기존 `GET /walk-experiences` 유지
- `from`, `to` Query Parameter 추가
- 년·월·일 선택은 프론트에서 기간으로 변환하여 요청
- `tag` Query Parameter 추가
- 기존 `emotion`, `companion` 기반 필터는 제거
- 태그 기준으로 기록 조회 및 앨범형 그룹화 처리

### 알림

- 산책 기록 제안은 기기 플러그인을 이용한 로컬 알림으로 처리
- 별도 알림 API 추가하지 않음
- FCM/APNs 서버 Push 사용하지 않음
- Push Token 저장하지 않음

---

## ERD

반영 필요:

다음 테이블 추가:

- `users`
- `experience_draft_emotions`
- `walk_experience_emotions`
- `walk_experience_tags`

전체 핵심 구조:

```text
users
  │
  ├── walk_candidates
  ├── experience_drafts
  └── walk_experiences

walk_candidates
      │
      │ 1 : 0..1
      ▼
experience_drafts
      │
      ├── experience_draft_emotions
      │
      │ 1 : 0..1
      ▼
walk_experiences
      │
      ├── walk_experience_emotions
      └── walk_experience_tags
```

기존:

```
walk_candidates
→ experience_drafts
→ walk_experiences
```

핵심 관계와 `FK + UNIQUE` 제약조건은 유지합니다.

`users`는 다음 세 가지 역할의 기준 테이블로 사용합니다.

- 로그인 인증
- 마이페이지 사용자 정보
- 사용자별 산책 데이터 소유권

마이페이지를 위한 별도의 `profiles` 테이블은 생성하지 않습니다.

---

## IA / 사용자 흐름

기존 기록 목록 Root 구조에서 다음 구조로 변경합니다.

```
앱 시작
↓
인증 여부 확인
├─ 미인증 → 로그인
└─ 인증됨
       ↓
MOWA 메인
├─ 산책 자동 감지 및 기록
├─ 산책 기록 확인
│   ├─ 년
│   ├─ 월
│   ├─ 일
│   └─ 태그 기반 그룹
├─ 마이페이지
│   ├─ 내 정보 조회
│   ├─ 닉네임 수정
│   └─ 로그아웃
└─ 설정
```

플로팅 바의 MVP 범위는 다음과 같이 적용합니다.

- 홈 → MVP 포함
- 통계 → MVP 제외
- 기록장 → MVP 포함
- 마이페이지 → MVP 포함

캘린더 년·월·일 조회, 태그 기반 기록 그룹화, 마이페이지를 최종 MVP 사용자 흐름에 포함합니다.