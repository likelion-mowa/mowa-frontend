# 🎨 [서비스명] Frontend

`[서비스명]`의 사용자 인터페이스와 클라이언트 기능을 담당하는 Frontend Repository입니다.

## 📌 주요 역할

* 산책 활동 감지 및 기록 제안 UI
* 감정·동반자·상황 입력
* 사진 촬영 및 사진 선택
* AI 산책 일기 생성 요청 및 결과 확인
* 산책 경험 수정·삭제
* 산책 아카이브 및 필터
* OS 권한 및 로컬 알림 처리
* Backend REST API 연동

---

## 🛠 Tech Stack

> 실제 프로젝트 설정 후 확정된 기술만 작성합니다.

```text
Framework     : [작성 예정]
Language      : [작성 예정]
Styling       : [작성 예정]
State         : [작성 예정]
HTTP Client   : [작성 예정]
Storage       : [작성 예정]
```

---

## 📂 Directory Structure

프로젝트 초기 구조 확정 후 작성합니다.

```text
src/
├── components/
├── pages/
├── api/
├── hooks/
├── types/
├── utils/
└── ...
```

---

## 🚀 Getting Started

### 1. Repository Clone

```bash
git clone [FRONTEND_REPOSITORY_URL]
cd [FRONTEND_REPOSITORY]
```

### 2. Dependency Install

```bash
npm install
```

### 3. Environment Variables

`.env.example`을 참고하여 로컬 `.env` 파일을 생성합니다.

```text
.env
```

> `.env` 파일은 Git에 Commit하지 않습니다.

### 4. Run

```bash
npm run dev
```

---

## 🌿 Branch Convention

```text
main
develop
feature/{기능명}
fix/{수정내용}
refactor/{리팩토링내용}
```

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

* `develop`을 기준으로 기능 Branch를 생성합니다.
* 작업 완료 후 `develop`을 대상으로 PR을 생성합니다.
* PR 생성 전 실행 및 주요 화면을 확인합니다.
* API 명세 변경이 필요한 경우 백엔드 담당자와 먼저 공유합니다.
* API Request/Response를 임의로 변경하지 않습니다.

---

## ⚠️ 개발 규칙

* Backend API 명세서를 기준으로 연동합니다.
* API JSON 필드는 `camelCase`를 사용합니다.
* OS 권한 및 활동 감지는 클라이언트에서 처리합니다.
* 사진은 Object Storage에 업로드한 후 전달받은 `photoUrl`을 Backend API에 전달합니다.
* 자동 산책 감지 ON/OFF 및 기록 제안 알림은 MVP에서 클라이언트 로컬 기능으로 처리합니다.
* API Key와 환경변수는 코드에 직접 작성하지 않습니다.

