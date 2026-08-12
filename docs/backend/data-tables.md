# 데이터 테이블

## 핵심 도메인 정리

**사용자 로그인 → 산책 후보 감지 → 경험 초안 및 AI 일기 생성 → 산책 경험 확정 → 캘린더·태그 기반 아카이브**

---

## 전체 테이블 목록

| 도메인 | 테이블 |
| --- | --- |
| 사용자 | `users` |
| 산책 후보 | `walk_candidates` |
| 경험 초안 | `experience_drafts` |
| 경험 초안 감정 | `experience_draft_emotions` |
| 산책 경험 | `walk_experiences` |
| 산책 경험 감정 | `walk_experience_emotions` |
| 산책 경험 태그 | `walk_experience_tags` |

> PostgreSQL 기준으로 작성합니다.
> 

MVP에서는 총 **7개 테이블**을 사용합니다.

---

# 1. 산책 후보 감지 및 기록 제안

스마트폰 OS 및 클라이언트 플러그인에서 감지한 걷기 결과를 산책 기록 후보로 저장합니다.

원시 센서 로그는 저장하지 않고 기록 흐름에 필요한 시작·종료 시각, 지속 시간, 주요 장소와 후보 상태만 관리합니다.

## `walk_candidates` 산책 후보

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` | 산책 후보 고유 ID |
| `user_id` | UUID | FK, NOT NULL | 산책 후보 소유 사용자 ID, `users(id)` 참조 |
| `detected_start_at` | TIMESTAMPTZ | NOT NULL | 걷기 시작 추정 시각 |
| `detected_end_at` | TIMESTAMPTZ | NULL 허용 | 걷기 종료 추정 시각 |
| `duration_seconds` | INT | NULL 허용 | 걷기 지속 시간(초) |
| `location_summary` | VARCHAR(255) | NULL 허용 | 주요 장소 또는 위치 요약 |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT `'DETECTED'` | 산책 후보 진행 상태 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 산책 후보 생성 시간 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 산책 후보 수정 시간 |

## status 값

| 값 | 설명 |
| --- | --- |
| `DETECTED` | 걷기 활동이 감지되어 Candidate가 생성된 상태 |
| `SUGGESTED` | 걷기 종료가 추정되어 사용자에게 기록을 제안한 상태 |
| `RECORDING` | 사용자가 `남기기`를 선택하여 기록을 진행 중인 상태 |
| `SKIPPED` | 사용자가 `건너뛰기`를 선택한 상태 |

## 제약조건

| 제약조건 | 설명 |
| --- | --- |
| `FK (user_id) REFERENCES users(id)` | 존재하는 사용자에 대해서만 Candidate 생성 |
| `CHECK (status IN ('DETECTED', 'SUGGESTED', 'RECORDING', 'SKIPPED'))` | 정의되지 않은 상태값 저장 방지 |
| `CHECK (detected_end_at IS NULL OR detected_end_at >= detected_start_at)` | 종료 시각이 시작 시각보다 빠른 데이터 방지 |
| `CHECK (duration_seconds IS NULL OR duration_seconds >= 0)` | 음수 지속 시간 저장 방지 |

## 비고

- `user_id`를 통해 Candidate 소유 사용자를 구분합니다.
- `user_id`는 클라이언트가 직접 전달하지 않고 Access Token으로 식별한 사용자를 서버가 설정합니다.
- `detected_end_at`, `duration_seconds`는 걷기 종료 전에는 NULL일 수 있습니다.
- 위치 좌표 및 위치 정밀도는 MVP에서 저장하지 않습니다.
- 이동 경로도 MVP에서 저장하지 않습니다.
- 실제 걷기 활동 감지 및 시작·종료 판단은 클라이언트 플러그인에서 수행합니다.
- 서버에는 감지 결과만 저장합니다.
- `updated_at`은 UPDATE 시 애플리케이션/ORM에서 갱신합니다.

---

# 2. 감정 중심 최소 경험 기록

사용자가 선택한 동반자·상황은 `experience_drafts`에 저장하고, 다중 선택이 가능한 감정은 `experience_draft_emotions`에 저장합니다.

## 최소 경험 입력값

| 항목 | 저장 위치 | 필수 여부 |
| --- | --- | --- |
| 사진 | `experience_drafts.photo_url` | 선택 |
| 동반자 | `experience_drafts.companion` | 선택 |
| 감정 | `experience_draft_emotions` | 선택, 다중 선택 |
| 상황 | `experience_drafts.situation` | 선택 |

기존 `note` / 한마디 입력은 현재 프로토타입에서 제거되었으므로 별도 컬럼을 사용하지 않습니다.

## 비고

- 미입력 항목은 NULL 또는 빈 감정 목록으로 유지합니다.
- 서버나 AI가 사용자가 입력하지 않은 관계·감정·상황을 임의로 채우지 않습니다.

---

# 3. 산책 사진 기록

산책 경험의 대표 이미지를 `experience_drafts`에 저장합니다.

## 사용 컬럼

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `photo_url` | TEXT | NULL 허용 | 대표 사진 URL, 최대 1장 |

## 비고

- 사진은 선택값이며 사진 없이 기록할 수 있습니다.
- 직접 촬영과 최근 사진 선택 모두 동일한 `photo_url` 컬럼을 사용합니다.
- 사진 파일 자체는 Object Storage에 저장합니다.
- DB에는 사진 파일이 아니라 URL만 저장합니다.
- 대표 사진은 최대 1장이므로 별도의 사진 테이블은 생성하지 않습니다.
- Soft Delete 시 Object Storage의 사진 파일을 자동 삭제하지 않습니다.
- 사진 파일 정리 기능은 MVP에서 제외합니다.

---

# 4. AI 산책 일기 생성

사용자가 남긴 사진·동반자·감정·상황과 Candidate의 객관적 정보를 기반으로 백엔드에서 OpenAI API를 호출하여 산책 일기를 생성합니다.

확정 전 사용자 입력과 AI 생성 결과는 `experience_drafts`에서 관리합니다.

## `experience_drafts` 경험 초안

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` | 경험 초안 고유 ID |
| `user_id` | UUID | FK, NOT NULL | 경험 초안 소유 사용자 ID, `users(id)` 참조 |
| `candidate_id` | UUID | FK, UNIQUE, NOT NULL | 출처 Candidate ID, `walk_candidates(id)` 참조 |
| `photo_url` | TEXT | NULL 허용 | 대표 사진 URL |
| `companion` | VARCHAR(30) | NULL 허용 | 사용자가 선택한 동반자 |
| `situation` | VARCHAR(30) | NULL 허용 | 사용자가 선택한 산책 상황 |
| `ai_title` | VARCHAR(100) | NULL 허용 | AI가 생성한 산책 일기 제목 |
| `ai_body` | TEXT | NULL 허용 | AI가 생성한 산책 일기 본문 |
| `ai_generation_status` | VARCHAR(20) | NOT NULL, DEFAULT `'PENDING'` | AI 생성 진행 상태 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 경험 초안 생성 시간 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 경험 초안 수정 시간 |

## ai_generation_status 값

| 값 | 설명 |
| --- | --- |
| `PENDING` | 아직 AI 생성을 요청하지 않은 상태 |
| `GENERATING` | AI 산책 일기를 생성 중인 상태 |
| `SUCCESS` | AI 제목·본문 생성에 성공한 상태 |
| `FAILED` | AI 생성에 실패한 상태 |

## 제약조건

| 제약조건 | 설명 |
| --- | --- |
| `FK (candidate_id) REFERENCES walk_candidates(id)` | 존재하는 Candidate에 대해서만 Draft 생성 |
| `FK (user_id) REFERENCES users(id)` | 존재하는 사용자에 대해서만 Draft 생성 |
| `UNIQUE(candidate_id)` | 하나의 Candidate에서 최대 하나의 Draft만 생성 |
| `CHECK (ai_generation_status IN ('PENDING', 'GENERATING', 'SUCCESS', 'FAILED'))` | 정의되지 않은 AI 생성 상태 저장 방지 |
| `CHECK (companion IS NULL OR companion IN ('ALONE', 'WITH_SOMEONE', 'PET'))` | 정의되지 않은 동반자 저장 방지 |
| `CHECK (situation IS NULL OR situation IN ('MORNING', 'AFTERNOON', 'EVENING', 'IN_TRANSIT', 'EXPLORING'))` | 정의되지 않은 상황 저장 방지 |
| `CHECK (ai_generation_status <> 'SUCCESS' OR (ai_title IS NOT NULL AND ai_body IS NOT NULL))` | SUCCESS 상태에서 제목·본문 존재 보장 |

---

## companion 허용값

| 코드 | 화면 표시 | 설명 |
| --- | --- | --- |
| `ALONE` | 혼자 | 혼자 걸은 산책 |
| `WITH_SOMEONE` | 누군가와 | 다른 사람과 함께한 산책 |
| `PET` | 반려동물과 | 반려동물과 함께한 산책 |

---

## emotion 허용값

감정은 별도 연결 테이블에서 다중 선택 값으로 관리합니다.

| 코드 | 화면 표시 |
| --- | --- |
| `CALM` | 차분한 |
| `HAPPY` | 행복한 |
| `TIRED` | 피곤한 |
| `REFRESHED` | 상쾌한 |
| `PENSIVE` | 생각에 잠긴 |

---

## situation 허용값

| 코드 | 화면 표시 |
| --- | --- |
| `MORNING` | 아침 |
| `AFTERNOON` | 오후 |
| `EVENING` | 저녁 |
| `IN_TRANSIT` | 이동 중 |
| `EXPLORING` | 탐험 |

---

## 비고

- `user_id`는 Access Token을 통해 식별한 사용자로 서버가 설정합니다.
- `experience_drafts.user_id`는 연결된 `walk_candidates.user_id`와 반드시 동일해야 합니다.
- 위 소유권 일치는 서비스 레이어에서 검증합니다.
- `companion`, `situation`은 선택값이므로 NULL을 허용합니다.
- 감정은 `experience_draft_emotions`에서 다중 값으로 관리합니다.
- API와 애플리케이션에서는 영문 코드값을 사용하고 화면에서는 한글 값을 표시합니다.
- Candidate의 시작·종료 시각, 지속 시간, 장소는 `candidate_id`를 통해 조회합니다.
- AI 생성 결과 중 `ai_title`, `ai_body`는 Draft에 저장합니다.
- AI가 생성한 `suggestedTags`는 Draft DB에 저장하지 않고 AI 생성 API Response로만 반환합니다.
- 사용자가 확인·수정하여 최종 확정한 태그만 `walk_experience_tags`에 저장합니다.
- `SUCCESS` 상태에서는 `ai_title`, `ai_body`가 모두 존재해야 합니다.
- Draft 수정은 `PENDING`, `FAILED` 상태에서만 허용합니다.
- `GENERATING`, `SUCCESS` 상태에서는 사용자 입력을 수정하지 않습니다.
- `FAILED` 상태에서는 동일 AI 생성 API를 통해 수동 재시도할 수 있습니다.
- AI 자동 재시도는 MVP에서 제공하지 않습니다.
- 기존 `finalized_at`은 사용하지 않습니다.
- `updated_at`은 UPDATE 시 애플리케이션/ORM에서 갱신합니다.

---

# 5. AI 일기 확인 및 산책 경험 확정

AI 생성 결과를 사용자가 확인·수정한 뒤 최종 산책 경험을 Snapshot 형태로 저장합니다.

`draft_id`로 생성 출처를 유지하지만, 일반 조회 시 Draft나 Candidate에 의존하지 않습니다.

## `walk_experiences` 산책 경험

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` | 산책 경험 고유 ID |
| `user_id` | UUID | FK, NOT NULL | 산책 경험 소유 사용자 ID, `users(id)` 참조 |
| `draft_id` | UUID | FK, UNIQUE, NOT NULL | 출처 Draft ID, `experience_drafts(id)` 참조 |
| `title` | VARCHAR(100) | NOT NULL | 사용자가 최종 확인·수정한 제목 |
| `body` | TEXT | NULL 허용 | 사용자가 최종 확인·수정한 본문 |
| `photo_url` | TEXT | NULL 허용 | 최종 대표 사진 URL |
| `started_at` | TIMESTAMPTZ | NOT NULL | 산책 시작 시각 |
| `ended_at` | TIMESTAMPTZ | NOT NULL | 산책 종료 시각 |
| `duration_seconds` | INT | NOT NULL | 산책 지속 시간(초) |
| `location_summary` | VARCHAR(255) | NULL 허용 | 주요 장소 또는 위치 요약 |
| `companion` | VARCHAR(30) | NULL 허용 | 최종 확정된 동반자 |
| `situation` | VARCHAR(30) | NULL 허용 | 최종 확정된 산책 상황 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 산책 경험 생성 시간 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 산책 경험 수정 시간 |
| `deleted_at` | TIMESTAMPTZ | NULL 허용 | Soft Delete 시 삭제 시각 |

## 제약조건

| 제약조건 | 설명 |
| --- | --- |
| `FK (draft_id) REFERENCES experience_drafts(id)` | 존재하는 Draft에서만 최종 Experience 생성 |
| `FK (user_id) REFERENCES users(id)` | 존재하는 사용자에 대해서만 Experience 생성 |
| `UNIQUE(draft_id)` | 하나의 Draft에서 최대 하나의 WalkExperience만 생성 |
| `CHECK (ended_at >= started_at)` | 종료 시각이 시작 시각보다 빠른 데이터 방지 |
| `CHECK (duration_seconds >= 0)` | 음수 산책 지속 시간 저장 방지 |
| `CHECK (companion IS NULL OR companion IN ('ALONE', 'WITH_SOMEONE', 'PET'))` | 정의되지 않은 동반자 저장 방지 |
| `CHECK (situation IS NULL OR situation IN ('MORNING', 'AFTERNOON', 'EVENING', 'IN_TRANSIT', 'EXPLORING'))` | 정의되지 않은 상황 저장 방지 |

---

## Snapshot 저장 기준

| 데이터 | 최종 저장 기준 |
| --- | --- |
| `started_at` | Candidate의 `detected_start_at` |
| `ended_at` | Candidate의 `detected_end_at` |
| `duration_seconds` | Candidate의 `duration_seconds` |
| `location_summary` | Candidate의 `location_summary` |
| `title` | 사용자가 최종 확인·수정한 제목 |
| `body` | 사용자가 최종 확인·수정한 본문 |
| `photo_url` | 사용자가 최종 확인·수정한 대표 사진 |
| `companion` | 사용자가 최종 확인·수정한 동반자 |
| `situation` | 사용자가 최종 확인·수정한 상황 |
| 감정 목록 | `walk_experience_emotions`에 최종 값 저장 |
| 태그 목록 | `walk_experience_tags`에 최종 값 저장 |

## 비고

- `draft_id`는 생성 출처와 데이터 정합성을 보장하기 위한 FK입니다.
- `user_id`는 Access Token 기준으로 서버가 설정합니다.
- `walk_experiences.user_id`는 연결된 `experience_drafts.user_id`와 반드시 동일해야 합니다.
- 위 소유권 일치는 서비스 레이어에서 검증합니다.
- 하나의 Draft에서는 최대 하나의 WalkExperience만 생성합니다.
- 동시 요청이 발생하더라도 `UNIQUE(draft_id)`가 최종 중복 방지 장치가 됩니다.
- Soft Delete된 WalkExperience도 DB에 남으므로 동일 Draft로 새로운 WalkExperience를 생성할 수 없습니다.
- 아카이브 및 상세 조회 시에는 Draft와 Candidate를 JOIN하지 않습니다.
- 시작·종료 시각, 지속 시간, 장소는 Candidate에서 Snapshot합니다.
- 사용자가 최종 확인·수정한 경험 정보는 최종 Experience에 독립적으로 저장합니다.
- 감정과 태그 역시 각각 연결 테이블에 최종 Snapshot으로 저장합니다.
- `title`은 필수이며 빈 문자열은 애플리케이션에서 허용하지 않습니다.
- `body`는 NULL을 허용합니다.
- `finalized_at`은 사용하지 않습니다.
- 최종 WalkExperience와 연결된 Draft는 MVP에서 보존합니다.
- 삭제는 `deleted_at`을 이용한 Soft Delete로 처리합니다.
- `updated_at`은 UPDATE 시 애플리케이션/ORM에서 갱신합니다.

---

# 6. 감성 산책 아카이브 및 캘린더 조회

최종 저장된 산책 경험을 날짜 기준으로 조회하여 경험 카드와 캘린더 형태로 제공합니다.

## 별도 테이블 없음

**사용 테이블**

- `walk_experiences`
- `walk_experience_emotions`
- `walk_experience_tags`

| 사용 컬럼 | 용도 |
| --- | --- |
| `id` | Experience 식별 |
| `photo_url` | 대표 사진 |
| `title` | 산책 일기 제목 |
| `started_at` | 날짜 표시, 캘린더 조회 및 정렬 |
| `location_summary` | 주요 장소 표시 |
| `companion` | 동반자 표시 |
| `situation` | 상황 표시 |
| `walk_experience_emotions.emotion` | 감정 목록 표시 |
| `walk_experience_tags.tag` | 태그 표시 및 그룹화 |

## 조회 정책

- 로그인 사용자의 데이터만 조회합니다.
- `deleted_at IS NULL`인 Experience만 반환합니다.
- 기본 정렬은 `started_at DESC`입니다.
- 년·월·일 정보는 별도 컬럼으로 저장하지 않습니다.
- 캘린더 조회는 `walk_experiences.started_at`을 기준으로 처리합니다.
- 날짜 범위는 서비스 기준 시간대인 **Asia/Seoul**을 기준으로 처리합니다.
- 별도의 Calendar 테이블은 생성하지 않습니다.
- MVP에서는 페이지네이션을 적용하지 않습니다.

## 권장 인덱스

```
walk_experiences(user_id, started_at)
```

사용자별 날짜순 조회 및 캘린더 조회를 위한 MVP 우선 인덱스입니다.

---

# 7. 산책 상세 조회

최종 저장된 Snapshot을 조회하여 상세 화면에 표시합니다.

## 사용 데이터

| 데이터 | 저장 위치 |
| --- | --- |
| 제목 | `walk_experiences.title` |
| 본문 | `walk_experiences.body` |
| 사진 | `walk_experiences.photo_url` |
| 시작 시각 | `walk_experiences.started_at` |
| 종료 시각 | `walk_experiences.ended_at` |
| 지속 시간 | `walk_experiences.duration_seconds` |
| 장소 | `walk_experiences.location_summary` |
| 동반자 | `walk_experiences.companion` |
| 상황 | `walk_experiences.situation` |
| 감정 목록 | `walk_experience_emotions` |
| 태그 목록 | `walk_experience_tags` |

## 비고

- 상세 조회는 `walk_experiences` Snapshot과 감정·태그 연결 테이블만 사용합니다.
- `experience_drafts`, `walk_candidates`를 JOIN하지 않습니다.
- `deleted_at`이 존재하는 Experience는 일반 상세 조회 대상에서 제외합니다.
- 다른 사용자가 소유한 Experience도 일반 사용자에게는 조회되지 않습니다.

---

# 8. 산책 기록 수정 및 삭제

사용자가 확정한 경험 내용을 수정하거나 Soft Delete합니다.

## 수정 대상

| 데이터 | 수정 여부 |
| --- | --- |
| `title` | 가능 |
| `body` | 가능 |
| `photo_url` | 가능 |
| `companion` | 가능 |
| `situation` | 가능 |
| 감정 목록 | 가능 |
| 태그 목록 | 가능 |
| `started_at` | 불가 |
| `ended_at` | 불가 |
| `duration_seconds` | 불가 |
| `location_summary` | 불가 |

## 비고

- `title`은 수정 이후에도 NULL 또는 빈 문자열이 될 수 없습니다.
- `body`, `photo_url`, `companion`, `situation`은 NULL을 허용합니다.
- 감정 목록과 태그 목록은 API PATCH 시 전체 교체 방식으로 수정합니다.
- 감정 또는 태그 필드를 PATCH에서 생략하면 기존 값을 유지합니다.
- 빈 배열을 전달하면 기존 감정 또는 태그를 모두 제거합니다.
- 기록 삭제는 Hard Delete가 아닌 Soft Delete로 처리합니다.
- 삭제 시 실제 행을 제거하지 않고 `deleted_at`에 현재 시각을 저장합니다.
- 삭제된 Experience는 일반 목록·상세·수정 대상에서 제외합니다.
- 삭제 복구 기능은 MVP에서 제공하지 않습니다.

---

# 9. 자동 감지 및 권한·알림 설정

활동 감지와 서비스 이용에 필요한 실제 기기 권한은 스마트폰 OS와 클라이언트에서 관리합니다.

## 별도 테이블 없음

| 항목 | 처리 위치 |
| --- | --- |
| 활동 감지 권한 | OS / 클라이언트 |
| 위치 권한 | OS / 클라이언트 |
| 알림 권한 | OS / 클라이언트 |
| 카메라 권한 | OS / 클라이언트 |
| 사진 라이브러리 권한 | OS / 클라이언트 |
| 자동 걷기 감지 ON/OFF | 클라이언트 로컬 |
| 산책 기록 제안 알림 | 클라이언트 로컬 알림 |

## 비고

- 실제 OS 권한 상태는 서버 DB에 저장하지 않습니다.
- 자동 걷기 감지 ON/OFF는 MVP에서 클라이언트 로컬 설정으로 관리합니다.
- 자동 감지 설정은 서버 DB에 저장하거나 계정 간 동기화하지 않습니다.
- 기록 제안 알림은 기기 플러그인을 이용한 클라이언트 로컬 알림으로 처리합니다.
- FCM/APNs 기반 서버 Push는 사용하지 않습니다.
- Push Token을 저장하지 않습니다.
- 별도 알림 테이블도 생성하지 않습니다.
- 권한 변경이 필요한 경우 OS 설정 화면으로 이동하여 처리합니다.

---

# 10. 산책 경험 데이터 저장 및 상태 관리

Candidate → Draft → WalkExperience로 이어지는 데이터 생명주기를 FK와 UNIQUE 제약조건으로 관리합니다.

## 별도 상태 관리 테이블 없음

**사용 테이블**

- `walk_candidates`
- `experience_drafts`
- `walk_experiences`

## 주요 관계

| 관계 | DB 보장 방식 | 설명 |
| --- | --- | --- |
| `walk_candidates 1 : 0..1 experience_drafts` | `candidate_id` FK + UNIQUE + NOT NULL | 하나의 Candidate에서 최대 하나의 Draft 생성 |
| `experience_drafts 1 : 0..1 walk_experiences` | `draft_id` FK + UNIQUE + NOT NULL | 하나의 Draft에서 최대 하나의 WalkExperience 생성 |

## 관계 구조

```
walk_candidates
      │
      │ id ← candidate_id
      │ FK + UNIQUE
      ▼
experience_drafts
      │
      │ id ← draft_id
      │ FK + UNIQUE
      ▼
walk_experiences
```

## 사용자 소유권 정합성

```
walk_candidates.user_id
        =
experience_drafts.user_id
        =
walk_experiences.user_id
```

- Draft를 생성할 때 로그인 사용자와 Candidate 소유 사용자가 동일한지 검증합니다.
- WalkExperience를 생성할 때 로그인 사용자와 Draft 소유 사용자가 동일한지 검증합니다.
- `user_id`는 클라이언트 Request에서 전달받지 않습니다.
- Access Token에서 식별한 사용자를 서버가 설정합니다.

## 비고

- Candidate → Draft와 Draft → WalkExperience 관계를 DB 제약조건으로 보장합니다.
- 사용자 소유권 연결의 일관성은 서비스 레이어에서도 검증합니다.
- `walk_experiences`는 Draft를 FK로 참조하지만 일반 사용자 조회는 Snapshot 데이터를 사용합니다.
- Soft Delete된 WalkExperience도 유지되므로 `UNIQUE(draft_id)`가 동일 Draft 재확정을 막습니다.
- 최종 WalkExperience와 연결된 Draft는 MVP에서 보존합니다.

---

# 11. 최근 사진 선택

별도의 테이블이나 컬럼을 추가하지 않습니다.

OS 사진 라이브러리에서 사용자가 사진을 선택하고 Object Storage에 업로드한 뒤 획득한 URL을 `experience_drafts.photo_url`에 저장합니다.

사진 정책은 기능 3과 동일합니다.

---

# 12. 캘린더 및 태그 기반 기록 조회

저장된 Experience를 날짜 또는 최종 태그를 기준으로 조회·그룹화합니다.

기존 감정·동반자 기반 Query 필터는 제거합니다.

## 별도 Calendar / Album 테이블 없음

**사용 테이블**

- `walk_experiences`
- `walk_experience_tags`

## 캘린더 조회

- 년·월·일 기준 조회는 `walk_experiences.started_at`을 사용합니다.
- `year`, `month`, `day`를 별도 DB 컬럼으로 저장하지 않습니다.
- 날짜 기준은 **Asia/Seoul**입니다.
- 별도의 Calendar 테이블은 생성하지 않습니다.

## 태그 기반 조회

| 사용 컬럼 | 용도 |
| --- | --- |
| `walk_experience_tags.tag` | 태그 기반 필터 및 앨범형 그룹화 |

### 정책

- `deleted_at IS NULL`인 Experience만 조회합니다.
- 동일 최종 태그가 저장된 Experience를 하나의 그룹처럼 표시합니다.
- AI를 다시 호출하여 그룹화하지 않습니다.
- 별도의 `albums`, `album_experiences` 테이블은 생성하지 않습니다.
- 별도의 `/albums`, `/groups`, `/search`용 DB 구조도 생성하지 않습니다.

## 인덱스

```
walk_experiences(user_id, started_at)
```

사용자별 캘린더 및 날짜순 조회를 위한 MVP 우선 인덱스로 사용합니다.

감정·동반자 단독 인덱스는 MVP에서 추가하지 않습니다.

---

# 13. 사용자 계정

로그인 인증, 마이페이지 사용자 정보 조회·수정, 산책 데이터 소유권 판단에 필요한 사용자 정보를 관리합니다.

## `users` 사용자

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` | 사용자 고유 ID |
| `login_id` | VARCHAR(50) | NOT NULL, UNIQUE | 로그인 ID |
| `password_hash` | VARCHAR(255) | NOT NULL | 비밀번호 해시값 |
| `nickname` | VARCHAR(30) | NOT NULL | 사용자 닉네임 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 사용자 생성 시간 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` | 사용자 정보 수정 시간 |

## 비고

- `login_id`만 UNIQUE로 관리합니다.
- `nickname`은 사용자 간 중복을 허용합니다.
- `users`는 로그인 인증과 마이페이지 사용자 정보의 기준 테이블입니다.
- `walk_candidates`, `experience_drafts`, `walk_experiences`가 각각 `user_id`로 `users(id)`를 참조합니다.
- 회원가입은 MVP에서 제공하지 않습니다.
- 사전 생성된 테스트 계정을 사용합니다.
- MVP에서는 Refresh Token을 별도로 관리하지 않습니다.
- 로그아웃은 클라이언트가 보관한 Access Token을 삭제하는 방식으로 처리합니다.
- 별도의 세션 또는 Refresh Token 테이블은 생성하지 않습니다.
- `updated_at`은 UPDATE 시 애플리케이션/ORM에서 갱신합니다.

---

# 14. 산책 경험 감정 다중 선택

사용자가 선택한 여러 감정을 Draft와 최종 Experience에 각각 별도 연결 테이블로 저장합니다.

별도의 대리키 `id`는 사용하지 않고 **복합 Primary Key**를 사용합니다.

---

## `experience_draft_emotions` 경험 초안 감정

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `draft_id` | UUID | FK, NOT NULL | Draft ID, `experience_drafts(id)` 참조 |
| `emotion` | VARCHAR(30) | NOT NULL | 감정 코드 |

## 제약조건

```
PRIMARY KEY (draft_id, emotion)
```

| 제약조건 | 설명 |
| --- | --- |
| `FK (draft_id) REFERENCES experience_drafts(id)` | 존재하는 Draft에 대해서만 감정 저장 |
| `PRIMARY KEY (draft_id, emotion)` | 동일 Draft 내 동일 감정 중복 저장 방지 |
| `CHECK (emotion IN ('CALM', 'HAPPY', 'TIRED', 'REFRESHED', 'PENSIVE'))` | 정의되지 않은 감정 저장 방지 |

---

## `walk_experience_emotions` 산책 경험 감정

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `experience_id` | UUID | FK, NOT NULL | Experience ID, `walk_experiences(id)` 참조 |
| `emotion` | VARCHAR(30) | NOT NULL | 최종 감정 코드 |

## 제약조건

```
PRIMARY KEY (experience_id, emotion)
```

| 제약조건 | 설명 |
| --- | --- |
| `FK (experience_id) REFERENCES walk_experiences(id)` | 존재하는 Experience에 대해서만 감정 저장 |
| `PRIMARY KEY (experience_id, emotion)` | 동일 Experience 내 동일 감정 중복 저장 방지 |
| `CHECK (emotion IN ('CALM', 'HAPPY', 'TIRED', 'REFRESHED', 'PENSIVE'))` | 정의되지 않은 감정 저장 방지 |

## 비고

- 별도의 UUID `id`는 생성하지 않습니다.
- 감정 연결 관계 자체가 행의 식별자이므로 복합 PK를 사용합니다.
- API에서는 `emotions[]` 배열로 전달합니다.
- PATCH 시 `emotions[]`는 전체 교체 방식으로 처리합니다.
- `emotions` 필드 생략 시 기존 값을 유지합니다.
- 빈 배열을 전달하면 감정을 모두 제거합니다.

---

# 15. 산책 경험 태그

하나의 산책 경험에 여러 태그를 저장하기 위해 별도 연결 테이블을 사용합니다.

별도의 Tag 마스터 테이블이나 대리키 `id`는 사용하지 않습니다.

## `walk_experience_tags` 산책 경험 태그

| 컬럼명 | 자료형 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| `experience_id` | UUID | FK, NOT NULL | Experience ID, `walk_experiences(id)` 참조 |
| `tag` | VARCHAR(50) | NOT NULL | 최종 태그 값, `#` 제외 |

## 제약조건

```
PRIMARY KEY (experience_id, tag)
```

| 제약조건 | 설명 |
| --- | --- |
| `FK (experience_id) REFERENCES walk_experiences(id)` | 존재하는 Experience에 대해서만 태그 저장 |
| `PRIMARY KEY (experience_id, tag)` | 동일 Experience 내 동일 태그 중복 저장 방지 |
| `CHECK (BTRIM(tag) <> '')` | 빈 문자열 또는 공백만 존재하는 태그 저장 방지 |

## 태그 정책

- 태그는 최대 50자입니다.
- DB에는 `#` 없이 저장합니다.
- 프론트에서 표시할 때만 `#`를 붙입니다.
- 하나의 Experience에는 최대 **10개**의 태그를 저장할 수 있습니다.
- 최대 10개 제한은 애플리케이션 레벨에서 검증합니다.
- 동일 Experience 내 중복 태그는 허용하지 않습니다.
- 빈 문자열 또는 공백만 존재하는 태그는 허용하지 않습니다.
- 사용자가 최종 확인·수정한 태그만 저장합니다.
- AI의 `suggestedTags` 자체는 이 테이블에 자동 저장하지 않습니다.
- PATCH 시 `tags[]`는 전체 교체 방식으로 처리합니다.
- `tags` 필드 생략 시 기존 값을 유지합니다.
- 빈 배열을 전달하면 태그를 모두 제거합니다.

### 저장 예시

화면:

```
#망원동
#오후산책
#혼자
```

DB:

```
망원동
오후산책
혼자
```

## 비고

- MVP에서는 별도의 `albums`, `album_experiences` 테이블을 생성하지 않습니다.
- 동일한 최종 태그를 가진 Experience를 조회하여 앨범처럼 그룹화합니다.
- 그룹화 시 OpenAI를 다시 호출하지 않습니다.

---

# MVP 확정 정책

| 항목 | MVP 정책 |
| --- | --- |
| 사용자 인증 | Access Token 기반 |
| 사용자 계정 | 사전 생성된 테스트 계정 |
| 회원가입 | MVP 제외 |
| 마이페이지 | 사용자 정보 조회, 닉네임 수정, 로그아웃 |
| nickname | 최대 30자, 중복 허용 |
| 로그인 ID | `VARCHAR(50)`, UNIQUE |
| 사용자 데이터 | 로그인 사용자별 분리 |
| `user_id` | Access Token 기준으로 서버가 설정 |
| 사진 저장 | Object Storage에 파일 저장, DB에는 URL만 저장 |
| 제목 | `walk_experiences.title` NOT NULL, 최대 100자 |
| 본문 | NULL 허용 |
| 감정 | 다중 선택, 연결 테이블 + 복합 PK |
| 태그 | 최대 10개, 각 최대 50자, 연결 테이블 + 복합 PK |
| AI 추천 태그 | DB 미저장 |
| 최종 태그 | 사용자 확인·수정 후 저장 |
| 삭제 | `deleted_at` 기반 Soft Delete |
| Snapshot | Candidate 객관 정보 + 사용자 최종 확인값 |
| AI SUCCESS | `ai_title`, `ai_body` 필수 |
| AI 실패 재시도 | 동일 AI 생성 API를 통한 수동 재시도 |
| Draft 보존 | 최종 Experience 생성 후에도 유지 |
| 캘린더 | `started_at` 기준 |
| 캘린더 시간대 | Asia/Seoul |
| 년·월·일 컬럼 | 별도 저장하지 않음 |
| 태그 그룹화 | 최종 태그 일치 기준 규칙 기반 |
| Album 테이블 | 생성하지 않음 |
| 자동 감지 ON/OFF | 클라이언트 로컬 설정 |
| 기록 제안 알림 | 클라이언트 로컬 알림 |
| 원격 Push | 사용하지 않음 |
| Push Token | 저장하지 않음 |
| Android / Web | 동일 Backend 및 DB 구조 사용 |

---

# 추후 결정 가능

| 항목 | 현재 MVP 처리 |
| --- | --- |
| 위치 좌표 및 정밀도 | `location_summary`만 저장 |
| 이동 경로 저장 | 저장하지 않음 |
| 미확정 Draft 보존 기간 | 추후 정리 정책 결정 |
| SKIPPED Candidate 보존 기간 | 추후 정리 정책 결정 |
| AI 생성 이력 | 저장하지 않음 |
| AI 원문/수정본 버전 관리 | 현재 최종값만 관리 |
| 프로필 이미지 | MVP 제외 |
| 비밀번호 변경 | MVP 제외 |
| 계정 탈퇴 | MVP 제외 |
| 원격 Push | MVP 제외 |
| 별도 앨범 생성·수정·삭제 | MVP 제외 |
| 페이지네이션 및 고급 검색 | MVP 제외 |

---

# MVP 기준 필수 테이블

| 우선순위 | 테이블 |
| --- | --- |
| 필수 | `users` |
| 필수 | `walk_candidates` |
| 필수 | `experience_drafts` |
| 필수 | `experience_draft_emotions` |
| 필수 | `walk_experiences` |
| 필수 | `walk_experience_emotions` |
| 필수 | `walk_experience_tags` |

---

# 최종 핵심 관계

```
users
  │
  ├── 1:N walk_candidates
  ├── 1:N experience_drafts
  └── 1:N walk_experiences

walk_candidates
      │
      │ 1 : 0..1
      ▼
experience_drafts
      │
      ├── 1:N experience_draft_emotions
      │
      │ 1 : 0..1
      ▼
walk_experiences
      │
      ├── 1:N walk_experience_emotions
      └── 1:N walk_experience_tags
```

핵심 생성 흐름은 다음과 같습니다.

```
walk_candidates
→ experience_drafts
→ walk_experiences
```

두 단계 모두 `FK + UNIQUE + NOT NULL`을 이용하여 **1 : 0..1 관계를 DB에서 직접 보장**합니다.

감정과 태그 연결 테이블은 별도의 대리키를 사용하지 않고 관계 대상 ID와 값으로 구성된 **복합 Primary Key**를 사용합니다.

`walk_experiences`는 `draft_id`를 보유하지만 아카이브·상세·캘린더·태그 조회에 필요한 데이터는 Snapshot으로 자체 보존하므로 일반 조회 시 Draft나 Candidate에 의존하지 않습니다.

MVP에서는 로그인 기반 사용자별 데이터 분리를 적용하며 `walk_candidates`, `experience_drafts`, `walk_experiences`는 각각 `user_id`로 소유 사용자를 구분합니다.

산책 경험 삭제는 `deleted_at`을 이용한 Soft Delete로 처리합니다.