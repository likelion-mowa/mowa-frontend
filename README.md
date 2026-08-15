# 🎨 모와(MOWA) Frontend Repository

모와(MOWA)의 사용자 인터페이스와 클라이언트 기능을 담당하는 Frontend Repository입니다.

## 📌 주요 역할

- 산책 활동 감지 및 기록 제안 UI
- 감정·동반자·상황 입력
- 사진 촬영 및 사진 선택
- AI 산책 일기 생성 요청 및 결과 확인
- 산책 경험 수정·삭제
- 산책 아카이브 및 필터
- OS 권한 및 로컬 알림 처리
- Backend REST API 연동

---

## 🛠 Tech Stack

```text
Framework     : Expo SDK 57 (~57.0.12) · React Native 0.86.2 · React 19.2.3
Routing       : Expo Router (파일 기반 — src/app 의 파일 하나가 화면 하나)
Language      : TypeScript ~5.9.3 (strict, src/ 에서 any 지양)
Styling       : NativeWind 4.2 + Tailwind CSS 3.4 (className, StyleSheet 아님)
State         : Zustand 5 (도메인당 스토어 하나)
HTTP Client   : fetch — 라이브러리 없음 (src/api/client.ts)
Storage       : expo-sqlite (iOS) / localStorage (web) · expo-secure-store (토큰)
Native        : modules/walk-detector (Swift Expo Module) · HealthKit 14 · CoreMotion
```

> ⚠️ **버전을 임의로 올리지 마세요.** `expo`/`react-native`/`react`는 세트로만 움직이고,
> Tailwind는 v3·NativeWind는 v4에 고정돼 있으며(v4/v5는 이 스택에서 깨짐),
> `react-native-nitro-modules`는 `0.35.10` **정확히** 고정입니다. 이유와 측정 근거는
> [`AGENTS.md`](AGENTS.md)에 있습니다. Expo 패키지는 `npm install`이 아니라
> `npx expo install`로 추가합니다.

---

## 📂 Directory Structure

```text
src/
├── app/                  # 화면 = 라우트 (Expo Router). 파일 하나가 화면 하나
│   ├── index.tsx                      # 홈
│   ├── archive.tsx                    # 기록장
│   ├── walk.tsx                       # 기록 제안 (알림 탭이 여기로 온다)
│   ├── diary/                         # 일기 작성 플로우
│   │                                  #   photo → context → generating → preview → done · edit
│   ├── experiences/[experienceId].tsx # 상세 · 인라인 수정 · 삭제
│   ├── settings/                      # 설정 · 자동 감지 · 권한
│   ├── login.tsx · onboarding.tsx
│   └── debug.tsx                      # 개발용 진단 화면 (제품 화면 아님)
├── adapters/             # 네이티브 기능으로 나가는 유일한 통로
│   │                     #   x.ts = 웹, x.native.ts = iOS, types.ts = 포트 정의
│   └── …                 #   health · location · notifications · photo-picker
│                         #   secure-store · storage · system-settings · walk-detector
├── api/                  # 백엔드 계약(types.ts) + HTTP 클라이언트(client.ts)
├── components/           # 화면 간 공유 UI
├── lib/                  # 순수 유틸 (format · kst · theme · animations)
└── stores/               # Zustand. auth · detection · diary-flow
                          #   experience · walk-candidate · diagnostics

modules/walk-detector/    # 로컬 Expo Module — 산책 감지 Swift 코어
plugins/                  # Expo config plugin (서명 팀 고정, 푸시 엔트리틀먼트 제거)
scripts/                  # 빌드·검증 스크립트 (웹 번들 누출 검사 등)
mock/                     # 로컬 mock 백엔드 (server.mjs · seed.json)
docs/                     # 백엔드 명세 미러 + API 구현 현황
ios/                      # prebuild 산출물 — 커밋하지 않고 직접 수정하지 않는다
```

**지켜야 할 경계 두 개.**

1. **화면·컴포넌트·스토어는 네이티브 모듈을 직접 import하지 않습니다.** 전부 `adapters/`를
   거칩니다. 화면에서 `expo-sqlite`를 import하는 순간 웹 번들이 깨지고, 그건 타입 검사로
   잡히지 않습니다 (`npm run verify:web`이 잡습니다).
2. **스토어만 `api/`와 `adapters/`를 호출합니다.** 화면은 스토어를 읽을 뿐입니다.

---

## 🚀 Getting Started

### 준비물

- **Node 22.6 이상** — mock 서버가 `src/api/types.ts`를 직접 import하므로
  `--experimental-strip-types`가 필요합니다.
- npm (pnpm·yarn 금지 — symlink 때문에 Expo autolinking과 Tailwind 스캔이 깨집니다)
- 터미널은 아무거나 괜찮습니다. Windows는 PowerShell·명령 프롬프트·Git Bash 모두 됩니다.

**OS별로 할 수 있는 것이 다릅니다.**

| 하고 싶은 것             | Windows | macOS |
| ------------------------ | :-----: | :---: |
| 웹으로 화면 검토 (1~3번) |    ✅    |   ✅   |
| iOS 실기기 빌드 (4번)    |    ❌    |   ✅   |

iOS 빌드는 Xcode가 필요해서 **macOS에서만** 됩니다. Windows에서는 1~3번으로 웹에서 화면을
보시고, 산책 감지처럼 iOS에서만 도는 기능은 데모 영상으로 확인해 주세요
([웹에서 볼 수 있는 것 / 없는 것](#-웹에서-볼-수-있는-것--없는-것)).

### 1. Clone & Install

세 줄 모두 Windows·macOS에서 동일합니다.

```bash
git clone https://github.com/likelion-walk-diary/walk-diary-frontend.git
cd walk-diary-frontend
npm install
```

> 설치 끝에 `[patch-expo-jsi] …` 로그가 찍힙니다. iOS 빌드에만 쓰는 패치라
> Windows에서는 무시하셔도 됩니다.

### 2. 환경변수 — **생략해도 됩니다**

`EXPO_PUBLIC_API_BASE_URL`의 기본값이 이미 `http://localhost:4000/api/v1`이라, 아래 로컬
mock을 쓸 거라면 `.env` 없이 그대로 동작합니다. **웹으로 화면만 볼 거라면 이 단계는 건너뛰세요.**

값을 바꿔야 할 때만 `.env.example`을 복사한 뒤 **에디터로 편집**합니다
(`.env`는 커밋하지 않습니다).

```bash
copy .env.example .env    # Windows — PowerShell·명령 프롬프트 공통
cp .env.example .env      # macOS
```

> `>` 리다이렉션으로 `.env`를 만들지 마세요. Windows PowerShell 5.1은 파일을 UTF-16으로
> 저장해서 Expo가 값을 읽지 못합니다. 에디터로 열어 고치는 쪽이 안전합니다.

**iOS 실기기에 붙일 때만** Mac의 LAN IP가 필요합니다 (아래는 macOS 전용 명령입니다):

```bash
echo "EXPO_PUBLIC_API_BASE_URL=http://$(ipconfig getifaddr en0):4000/api/v1" > .env
```

> `EXPO_PUBLIC_*`는 **번들 타임에 인라인**됩니다. `.env`를 고쳤으면 dev 서버를 반드시
> 재시작하세요. 안 그러면 이전 값이 그대로 돌아갑니다.

### 3. 웹으로 화면 보기 (디자인 검토용)

터미널 **두 개**가 필요합니다. 두 명령 모두 Windows·macOS에서 동일합니다.

```bash
npm run mock    # 터미널 1 — 로컬 mock 백엔드 (http://localhost:4000/api/v1)
npm run web     # 터미널 2 — 웹 dev 서버 (http://localhost:8081)
```

브라우저에서 `http://localhost:8081`을 열고 로그인합니다.

> **Windows에서 방화벽 창이 뜨면** 허용하지 않아도 됩니다. 내 PC의 브라우저에서
> `localhost`로 접속하는 건 차단해도 그대로 동작합니다. 같은 Wi-Fi의 다른 기기에서
> 열어볼 때만 '사설 네트워크' 허용이 필요합니다.

| loginId  | password   | 데이터                                      |
| -------- | ---------- | ------------------------------------------- |
| `mowa01` | `password` | 확정된 산책 기억 여러 건 (검토용은 이 계정) |
| `mowa02` | `password` | 소유권 분리 확인용 (데이터 거의 없음)       |

계정과 mock의 동작 범위는 [`mock/README.md`](mock/README.md)에 있습니다.
데이터를 시드 상태로 되돌리려면 mock을 끄고 `npm run mock:reset`을 실행하세요.

### 4. iOS 실행 — **macOS + Xcode 전용**

Windows에서는 이 단계를 실행할 수 없습니다. 3번까지만 하시면 됩니다.

```bash
npm run ios:clean   # 첫 빌드 (prebuild 포함)
npm run ios         # 이후
```

Expo Go로는 동작하지 않습니다 (Development Build 전용). 자세한 규칙과 함정은
[`AGENTS.md`](AGENTS.md)를 보세요.

---

## 🖥 웹에서 볼 수 있는 것 / 없는 것

웹은 **UI 검토용**입니다. 아래 기능은 iOS 전용이라 웹에서는 어댑터가 "사용 불가"를
반환합니다 — 가짜 데이터를 만들어 보여주지 않습니다.

| 웹에서 확인 가능               | iOS에서만 동작              |
| ------------------------------ | --------------------------- |
| 홈 · 기록장 · 상세 · 수정/삭제 | 산책 자동 감지 (CoreMotion) |
| 일기 작성 플로우 · AI 생성     | HealthKit · 백그라운드 위치 |
| 로그인 · 온보딩 · 설정         | 기록 제안 로컬 알림         |
| 권한 화면 (상태 표시만)        | 사진 촬영                   |

개발용 진단 화면은 `/debug`에 있습니다 (판정 근거·브리지 상태 확인용).

### 알아둘 것

- **직접 URL 입력·새로고침은 `npm run web`에서만 됩니다.** 정적 빌드
  (`npm run export:web` + `npm run serve:web`)는 `expo export`가
  `experiences/[experienceId].html`을 대괄호 그대로 생성하기 때문에,
  `/experiences/<id>`로 바로 들어가면 `Not Found`가 뜹니다. 앱 안에서 눌러 들어가는
  것은 정상입니다.
- **배포된 Vercel 주소로는 로그인 이후를 볼 수 없습니다.** 백엔드가 아직 배포되지
  않았고, mock은 로컬 전용이라 배포본이 가리킬 주소가 없습니다. 화면 검토는 위의 로컬
  절차로 해주세요.

---

## 🌿 Branch Convention

```text
main
feature/{기능명}
fix/{수정내용}
```

> `main`이 통합 브랜치입니다. 작업 브랜치는 항상 최신 `main`에서 생성하고 `main`으로 PR합니다.

예시:

```text
feature/walk-record
feature/archive
fix/photo-preview
```

---

## 💬 Commit Convention

```text
feat: 새로운 기능
fix: 버그 수정
refactor: 리팩토링
style: 스타일 변경
docs: 문서 수정
test: 테스트
chore: 설정 및 기타 작업
```

예시:

```text
feat: 감정 선택 화면 구현
fix: 산책 기록 상세 페이지 오류 수정
style: 아카이브 카드 UI 수정
```

---

## 🔀 Pull Request

- 최신 `main`을 기준으로 기능 Branch를 생성합니다.
- 작업 완료 후 `main`을 대상으로 PR을 생성합니다.
- PR 제목은 `[Feat] 산책 기록 화면 구현` 형식을 사용합니다.
- PR 본문은 `## 작업 내용`, `## 확인 사항` 두 섹션으로 작성합니다.
- PR 생성 전 실행 및 주요 화면을 확인합니다.
- API 명세 변경이 필요한 경우 백엔드 담당자와 먼저 공유합니다.
- API Request/Response를 임의로 변경하지 않습니다.

---

## ⚠️ 개발 규칙

- Backend API 명세서를 기준으로 연동합니다.
- API JSON 필드는 `camelCase`를 사용합니다.
- OS 권한 및 활동 감지는 클라이언트에서 처리합니다.
- 사진은 **Object Storage 미정 — 현재는 로컬 URI를 그대로 `photoUrl`로 전달합니다**
  (팀 결정 2026-08-14). iOS는 앱 샌드박스 `file://`, 웹은 object URL이라 **사진을 고른
  기기에서만 보입니다.** 스토리지가 정해지면 업로드 후 받은 URL을 보내도록 바꿉니다.
- 자동 산책 감지 ON/OFF 및 기록 제안 알림은 MVP에서 클라이언트 로컬 기능으로 처리합니다.
- API Key와 환경변수는 코드에 직접 작성하지 않습니다.
