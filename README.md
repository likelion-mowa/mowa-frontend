# 🎨 MOWA Frontend

> **Moment & Walk, 걸으며 순간을 모으다.**

MOWA의 사용자 인터페이스와 클라이언트 기능을 담당하는 Frontend Repository입니다.

걷기 활동 감지부터 기록 제안, 최소 경험 입력, AI 산책 일기 생성, 산책 경험 아카이빙까지 MOWA의 전체 사용자 경험을 구현합니다.

---

## ✨ 주요 기능

* 🚶 걷기 활동 감지 및 산책 기록 제안
* 💭 감정·동반자·상황 중심의 최소 경험 입력
* 📷 사진 촬영 및 최근 사진 선택
* 🤖 AI 산책 일기 생성 요청 및 결과 확인
* ✏️ AI 결과 확인·수정 및 최종 경험 저장
* 🗂️ 산책 경험 아카이브 및 상세 조회
* 📅 캘린더·태그 기반 산책 경험 조회
* ⚙️ OS 권한 및 자동 감지 설정
* 🔔 산책 기록 제안 로컬 알림
---

## 🔄 사용자 흐름

```text
걷기 활동 감지
      ↓
산책 후보 생성
      ↓
기록 제안
      ↓
사진 · 감정 · 동반자 · 상황 입력
      ↓
AI 산책 일기 생성
      ↓
사용자 확인 · 수정
      ↓
산책 경험 저장
      ↓
아카이브 · 캘린더 · 태그 조회
```

---

## 🛠 Tech Stack

| Category       | Technology                                  |
| -------------- | ------------------------------------------- |
| Framework      | Expo SDK 57 · React Native 0.86 · React 19  |
| Routing        | Expo Router                                 |
| Language       | TypeScript                                  |
| Styling        | NativeWind 4 · Tailwind CSS 3               |
| State          | Zustand 5                                   |
| HTTP           | Fetch API                                   |
| Local Storage  | expo-sqlite / localStorage                  |
| Secure Storage | expo-secure-store                           |
| Native         | CoreMotion · HealthKit · Custom Expo Module |

> 의존성 버전과 설치 규칙은 프로젝트 안정성을 위해 고정되어 있습니다.
> 패키지 버전 변경 및 Expo 의존성 추가 전 [`AGENTS.md`](AGENTS.md)를 확인해주세요.

---

## 🏗 Architecture

Frontend는 Web과 Native 환경을 함께 지원하기 위해 **Adapter Pattern**을 사용합니다.

```text
Screen / Component
       ↓
     Store
       ↓
 ┌─────────────┐
 │ API Adapter │ → Backend REST API
 │ Native      │ → 활동 감지 · 위치 · 알림 · 사진
 └─────────────┘
```

### 주요 원칙

1. 화면과 컴포넌트는 Native Module을 직접 호출하지 않습니다.
2. Native 기능은 모두 `adapters/`를 통해 접근합니다.
3. API 및 Adapter 호출은 Store에서 담당합니다.
4. 화면은 Store의 상태와 액션을 사용합니다.

이를 통해 Native 전용 기능이 Web Bundle에 직접 포함되는 것을 방지합니다.

---

## 📂 Directory Structure

```text
src/
├── app/                  # Expo Router 기반 화면
│   ├── index.tsx         # 홈
│   ├── archive.tsx       # 산책 기록장
│   ├── walk.tsx          # 산책 기록 제안
│   ├── diary/            # 산책 일기 작성 플로우
│   ├── experiences/      # 산책 경험 상세 · 수정 · 삭제
│   ├── settings/         # 자동 감지 · 권한 설정
│   ├── login.tsx
│   └── onboarding.tsx
│
├── adapters/             # Native / Web 기능 추상화
├── api/                  # Backend API 계약 및 HTTP Client
├── components/           # 공통 UI Component
├── lib/                  # 공통 Utility
└── stores/               # Zustand State

modules/
└── walk-detector/        # 걷기 활동 감지 Custom Expo Module

plugins/                  # Expo Config Plugin
scripts/                  # Build · Verification Script
mock/                     # Local Mock Backend
docs/                     # API 및 개발 관련 문서
```

---

## 🚀 Getting Started

### Requirements

* Node.js 22.6+
* npm
* Web 실행: Windows / macOS
* Native iOS 실행: macOS + Xcode

> 패키지 관리는 `npm`을 사용합니다. Expo 패키지는 `npx expo install`을 사용해주세요.

### 1. Clone

```bash
git clone https://github.com/likelion-mowa/mowa-frontend.git
cd mowa-frontend
npm install
```

---

### 2. Environment Variables

기본 로컬 Mock API 주소:

```text
http://localhost:4000/api/v1
```

실제 API 서버를 사용하는 경우 `.env.example`을 참고하여 다음 값을 설정합니다.

```env
EXPO_PUBLIC_API_BASE_URL={API_BASE_URL}
```

`.env` 파일은 Git에 포함하지 않습니다.

> `EXPO_PUBLIC_*` 환경변수는 번들 시 반영되므로 값을 변경한 경우 개발 서버를 재시작해야 합니다.

---

## 🌐 Web 실행

UI와 Web 지원 기능은 로컬 Mock Server를 이용해 확인할 수 있습니다.

터미널 1:

```bash
npm run mock
```

터미널 2:

```bash
npm run web
```

브라우저:

```text
http://localhost:8081
```

### Local Mock Account

| loginId  | password   | 용도                       |
| -------- | ---------- | ------------------------ |
| `mowa01` | `password` | 산책 경험 데이터가 포함된 UI 테스트 계정 |
| `mowa02` | `password` | 사용자 데이터 분리 테스트 계정        |

> 위 계정은 `mock/`에서 사용하는 **로컬 개발용 계정**입니다.

Mock 데이터 초기화:

```bash
npm run mock:reset
```

자세한 내용은 [`mock/README.md`](mock/README.md)를 참고해주세요.

---

## 📱 Native 실행

Native 기능은 Development Build 환경에서 실행합니다.

```bash
npm run ios:clean   # 최초 실행
npm run ios         # 이후 실행
```

> Xcode가 필요하므로 macOS 환경에서 실행해야 합니다.
> Custom Native Module을 사용하므로 Expo Go에서는 실행할 수 없습니다.

---

## 🌐 Web / Native 지원 범위

| Web          | Native         |
| ------------ | -------------- |
| 로그인 · 온보딩    | 로그인 · 온보딩      |
| 홈 · 아카이브     | 홈 · 아카이브       |
| 산책 일기 작성     | 산책 일기 작성       |
| AI 일기 생성     | AI 일기 생성       |
| 상세 · 수정 · 삭제 | 상세 · 수정 · 삭제   |
| 설정 화면        | 실제 OS 권한 처리    |
| 권한 상태 UI     | 걷기 활동 자동 감지    |
| 캘린더 · 태그 조회  | 위치 · 활동 정보 연동  |
| -            | 산책 기록 제안 로컬 알림 |
| -            | 사진 촬영          |

Web에서는 Native 기능을 임의의 Mock 데이터로 대체하지 않고, 지원 여부에 따라 적절한 fallback을 제공합니다.

---

## 🔗 Backend Integration

Frontend는 Backend의 REST API와 연동합니다.

```text
Frontend
    ↓
src/api/client.ts
    ↓
Backend REST API
    ↓
Candidate → Draft → AI Generation → WalkExperience
```

주요 연동 영역:

* Access Token 기반 인증
* 산책 후보 생성 및 상태 변경
* 경험 Draft 생성·수정
* AI 산책 일기 생성
* 최종 WalkExperience 저장
* 산책 경험 목록·상세 조회
* 산책 경험 수정·삭제
* 날짜·태그 기반 조회

API Request/Response의 JSON 필드는 `camelCase`를 사용합니다.

---

## 🌿 Branch Convention

```text
main
├── feature/{기능명}
├── fix/{수정내용}
└── refactor/{수정내용}
```

`main`을 통합 브랜치로 사용하며 작업 브랜치는 최신 `main`에서 생성합니다.

예시:

```text
feature/walk-record
feature/archive
fix/photo-preview
```

---

## 💬 Commit Convention

| Type       | Description |
| ---------- | ----------- |
| `feat`     | 새로운 기능      |
| `fix`      | 버그 수정       |
| `refactor` | 리팩토링        |
| `style`    | 스타일 변경      |
| `docs`     | 문서 수정       |
| `test`     | 테스트         |
| `chore`    | 설정 및 기타 작업  |

예시:

```text
feat: 감정 선택 화면 구현
fix: 산책 기록 상세 페이지 오류 수정
style: 아카이브 카드 UI 수정
```

---

## 🔀 Pull Request

* 최신 `main`에서 작업 Branch를 생성합니다.
* 작업 완료 후 `main`을 대상으로 PR을 생성합니다.
* PR 제목은 `[Feat] 산책 기록 화면 구현`과 같은 형식을 사용합니다.
* PR 생성 전 주요 기능과 화면을 확인합니다.
* Backend API 계약 변경이 필요한 경우 담당자와 먼저 공유합니다.
* API Request/Response를 Frontend에서 임의로 변경하지 않습니다.

---

## ⚠️ Development Rules

* Backend API 명세를 기준으로 연동합니다.
* Native 기능은 반드시 `adapters/`를 통해 접근합니다.
* 자동 산책 감지 및 기록 제안 알림은 클라이언트에서 처리합니다.
* API Key, Access Token 및 기타 Secret은 코드에 직접 작성하지 않습니다.
* `.env` 등 민감한 로컬 설정 파일은 Git에 포함하지 않습니다.
* 세부 개발·의존성 규칙은 [`AGENTS.md`](AGENTS.md)를 따릅니다.

