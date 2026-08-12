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
- 상태 전이는 `DETECTED → SUGGESTED → RECORDING | SKIPPED`만 허용합니다.
  명세 다이어그램을 그대로 따랐으므로 `DETECTED → RECORDING` 직행은 400입니다.

## 검증

`npm run mock:test`는 서버를 별도 포트(4999)와 임시 db로 직접 띄운 뒤 70개 assertion을
돌립니다. `npm run mock`이 켜져 있어도 안전하고, 개발용 `db.json`을 건드리지 않습니다.

커버하는 것: 봉투 형태, 인증 401, 소유권 404, 상태 전이 400, Candidate/Draft/Experience
중복 409, `emotions[]`·`tags[]` 전체 교체, `null` 제거와 생략 유지, title·태그 길이·개수·
중복 검증, Snapshot 정확성, KST 날짜 경계, 쿼리 조합 400, Soft delete 후 404와 재확정 409.
