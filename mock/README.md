# Mock 백엔드

`docs/backend/`의 명세대로 동작하는 로컬 가짜 백엔드입니다.
실제 백엔드가 준비되기 전까지 프론트엔드 작업을 막지 않는 것이 목적입니다.

```bash
npm run mock        # http://localhost:4000/api/v1
npm run mock:test   # 명세 준수 여부 검증 (70개 assertion)
npm run mock:reset  # db.json 삭제 → 다음 실행 때 seed.json으로 초기화
```

테스트 계정 — 비밀번호는 둘 다 `password`

| loginId | nickname | 데이터 |
| --- | --- | --- |
| `mowa01` | 모아 | Candidate 3건, Draft 2건, 확정된 경험 1건 |
| `mowa02` | 두번째사용자 | Candidate 1건 (소유권 분리 확인용) |

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"loginId":"mowa01","password":"password"}'
# → { "success": true, "message": "...", "data": { "accessToken": "mock.1111...." } }

curl -s http://localhost:4000/api/v1/walk-experiences \
  -H 'authorization: Bearer mock.11111111-1111-4111-8111-111111111111'
```

## ⚠️ 로컬 개발 전용입니다

**배포된 Vercel 웹에서는 동작하지 않습니다.** 심사위원 브라우저의 `localhost:4000`은
그 사람의 컴퓨터를 가리키고, HTTPS 페이지에서 `http://`로 요청하면 mixed content로
차단됩니다. 배포 웹까지 살리려면 이 Express 앱을 HTTPS로 호스팅해야 합니다.

| 환경 | Base URL |
| --- | --- |
| `npm run web` | `http://localhost:4000/api/v1` |
| iOS 시뮬레이터 | `http://localhost:4000/api/v1` |
| **iOS 실기기** | `http://<Mac의 LAN IP>:4000/api/v1` — 같은 Wi-Fi 필요 |

실기기는 추가로 `app.json`에 ATS 예외(`NSAllowsLocalNetworking`)가 필요할 수 있고
iOS 14+ 로컬 네트워크 권한 프롬프트가 뜰 수 있습니다. **기기에서 확인이 필요한 항목입니다.**

## 설계 메모

### 왜 그냥 `json-server db.json`이 아닌가

이 명세는 CRUD가 아닙니다. 공통 응답 봉투, Bearer 인증과 남의 리소스를 404로 숨기는
소유권 규칙, 두 개의 상태 기계, 액션 엔드포인트(`ai-generation`), 확정 시 Snapshot,
Soft delete, 쿼리 조합 400 규칙 — json-server의 자동 라우터는 이 중 무엇도 표현하지 못합니다.

그래서 json-server는 **잘하는 일에만** 씁니다: 파일 기반 lowdb 저장소(`router.db`)와
기본 미들웨어(CORS·로거). 라우트는 전부 명세대로 직접 작성했습니다.
원시 테이블은 디버깅용으로 `/_db`에 그대로 노출해 두었습니다.

### 버전이 0.17.4인 이유

현재 `npm i json-server`가 설치하는 `latest`는 **`1.0.0-beta.15`** — 정식 v1이 없고
latest 태그가 베타를 가리킵니다. 그리고 v1은 CLI 전용으로 바뀌며 라이브러리/미들웨어
API가 빠졌습니다. Express에 마운트할 수 있는 마지막 버전이 `0.17.4`입니다.

### 앱과 코드값이 어긋날 수 없는 이유

`server.mjs`는 코드값·길이 제한·쿼리 조합 규칙을 **`src/api/types.ts`에서 직접
import**합니다. 앱이 컴파일되는 바로 그 모듈입니다. 감정을 하나 추가하면 이 서버가
받아들이는 값도 같이 바뀌고, 따로 관리할 두 번째 목록이 없습니다.

TypeScript를 Node에서 그대로 읽기 위해 npm 스크립트가 `--experimental-strip-types`를
넘깁니다. **Node 22.6 이상이 필요합니다.**

### 실제 백엔드와 다른 점

의도적으로 흉내만 낸 부분입니다. 통합 전에 확인하세요.

- **토큰이 `mock.<userId>`** 입니다. JWT가 아니고 서명도 만료도 없습니다.
- **비밀번호가 평문**입니다. 명세의 `password_hash`와 달리 해싱하지 않습니다.
- **AI 생성이 결정적**입니다. OpenAI를 호출하지 않고 입력값을 조합해 문장을 만듭니다.
  사용자가 입력하지 않은 값은 문장에 넣지 않습니다(명세의 금지 사항).
  실패 경로를 테스트하려면 `?fail=1`을 붙이면 `FAILED`로 전이합니다.
- **사진 업로드가 없습니다.** 명세대로 Object Storage는 별도이고 여기선 `photoUrl`
  문자열만 받습니다. 임의의 URL을 넣으면 됩니다.
- **페이지네이션이 없습니다.** MVP 명세와 동일합니다.
- **목록 응답에 `durationSeconds`가 없습니다.** 명세 그대로입니다. 기록장의
  "누적 시간" 합산 로직을 로컬에서 확인하고 싶을 때만 `MOCK_LIST_DURATION=1 npm run mock`
  으로 켜세요. 이 스위치를 켜고 통과했다고 해서 실제 백엔드가 필드를 준다는 뜻은
  아닙니다 (백엔드에 추가 요청 중 — `docs/api-implementation.md` 공백 8).
- 상태 전이는 `DETECTED → SUGGESTED → RECORDING | SKIPPED`만 허용합니다.
  명세 다이어그램을 그대로 따랐으므로 `DETECTED → RECORDING` 직행은 400입니다.

### 명세가 정하지 않아 **내가 임의로 정한 것**

위의 "다른 점"은 의도적으로 흉내만 낸 부분이고, 아래는 성격이 다릅니다.
명세에 답이 없어서 한쪽으로 정한 것들이라 **실제 백엔드와 다를 수 있습니다.**

이 mock은 명세에 대한 하나의 해석이고, 실제 백엔드는 같은 문서를 읽은 다른 사람의
해석입니다. **클라이언트가 mock과 맞는다고 해서 백엔드와 맞는다는 뜻은 아닙니다.**

| 항목 | 내가 정한 값 | 위험 |
| --- | --- | --- |
| `error.code` 문자열 | HTTP status를 그대로 옮긴 값 (`NOT_FOUND` `BAD_REQUEST` `CONFLICT` `UNAUTHORIZED`) + `AI_GENERATION_FAILED` | 명세에 있는 건 `INVALID_CREDENTIALS` 하나뿐. **팀 결정: 분기는 HTTP status로 하고 코드는 나중에 분리** ↓ |
| 생성 성공 코드 | `201` (Candidate·Draft·Experience) | 명세 미지정. 백엔드가 `200`일 수 있습니다. |
| 오류 코드 선택 | RECORDING 아닌 Candidate에 Draft → `400` | 명세는 조건만 적고 코드를 안 정했습니다. `409`일 수도 있습니다. |
| 상태 전이 엄격성 | `DETECTED → RECORDING` 직행을 `400`으로 거부 | 명세 다이어그램을 강제 규칙으로 읽었습니다. 예시일 뿐일 수 있습니다. |
| 수정 불가 필드 | `startedAt` 등을 보내면 `400` | 명세는 "수정 범위에서 제외"라고만 합니다. 백엔드는 조용히 무시할 수 있습니다. |
| 응답 봉투 적용 범위 | 전 엔드포인트에 적용 | 명세의 엔드포인트별 Response 블록은 필드만 나열합니다. 일관된 해석이지만 가정입니다. |
| `message` 문자열 | 전부 제가 씀 | 표시용으로 쓰지 마세요. |
| AI 생성 지연 | 즉시 응답 | 실제로는 OpenAI 호출이라 수 초 걸립니다. **로딩 상태·타임아웃은 이 mock으로 검증되지 않습니다.** |
| 동시성 | lowdb, 트랜잭션 없음. UNIQUE는 조회 후 삽입이라 경합에 취약 | 실제 DB는 제약조건으로 강제합니다. 단일 사용자 테스트로는 드러나지 않습니다. |

**`error.code` — 팀 결정 (2026-08-12)**

지금은 **HTTP status로만 분기**하고, `error.code`는 백엔드가 목록을 확정한 뒤에 분리합니다.

- 신뢰할 것: 명세가 명시한 `401`, `404`, `409`, 쿼리 규칙 `400`, 그리고 봉투의 `success`
- 로깅에만 쓸 것: `error.code`, `error.detail`
- `error.code`로 `switch`를 쓰면 실제 백엔드에서 조용히 `default`로 빠집니다.
  크래시가 아니라 **잘못된 UI**라서 알아채기 어렵습니다.

백엔드가 코드를 공개하면 다른 코드값들처럼 `src/api/types.ts`에 `as const` + union으로
넣고 이 서버가 import하면 됩니다. 나중에 분리하는 비용은 싸고, 지금 의존하는 비용은 비쌉니다.

**나머지 표는 백엔드 담당자와 맞춰야 할 목록입니다.**
(AGENTS.md: "Coordinate API request/response changes with the backend before merging.")

### `emotions[]`·`tags[]` 순서

**코드 기준 정렬**로 반환합니다. 저장 순서가 아닙니다.

결정적이라 같은 데이터가 항상 같게 렌더링되고 스냅샷 테스트가 흔들리지 않습니다.
또 이 테이블들이 `PRIMARY KEY (parent_id, value)`라 `ORDER BY` 없는 조회는 그 B-tree에서
값 순서로 나올 가능성이 높아, 실제 백엔드에 더 가까운 추측이기도 합니다.

그래도 남의 구현에 대한 추측입니다. **둘 다 집합이므로 배열 위치로 비교하지 마세요.**
`JSON.stringify(before) === JSON.stringify(after)` 같은 변경 감지는 정렬이 보장돼야만
안전하고, 실제 백엔드가 다른 순서를 주면 그대로 오판합니다.

### 반대로, 믿어도 되는 것

명세가 **명시적으로 정한** 규칙은 그대로 구현했고 계약 테스트가 지키고 있습니다.

필드 이름과 타입, 코드값 5종, `Candidate → Draft → Experience` 1:0..1 파이프라인,
PATCH 의미론(생략=유지 / `null`=제거 / 배열=전체 교체), Soft delete 후 404와 재확정 409,
소유권을 404로 숨기기, 토큰 없음·무효 시 401, 쿼리 조합 400 규칙, KST 날짜 경계,
Snapshot 대상 필드, title·태그 길이와 개수 제한.

## 검증

`npm run mock:test`는 서버를 별도 포트(4999)와 임시 db로 직접 띄운 뒤 71개 assertion을
돌립니다. `npm run mock`이 켜져 있어도 안전하고, 개발용 `db.json`을 건드리지 않습니다.

커버하는 것: 봉투 형태, 인증 401, 소유권 404, 상태 전이 400, Candidate/Draft/Experience
중복 409, `emotions[]`·`tags[]` 전체 교체, `null` 제거와 생략 유지, title·태그 길이·개수·
중복 검증, Snapshot 정확성, KST 날짜 경계, 쿼리 조합 400, Soft delete 후 404와 재확정 409.
