# TestFlight 오픈 베타 제출 자료

App Store Connect에 그대로 붙여 넣을 문구 모음이다. 모든 내용은 이 저장소의 코드에서
확인한 사실만 담았다 — 근거 파일을 각 항목에 적어 두었으니, 코드가 바뀌면 여기도 고친다.

앱: **Mowa** · `com.mowa.app` · version 0.1.0

---

## 1. 개인정보처리방침 URL

```
https://walk-diary-frontend.vercel.app/privacy
```

- 실체는 `public/privacy.html`이다. `npx expo export -p web`이 `public/`을 `dist/` 루트로
  복사하고, `vercel.json`의 `cleanUrls: true`가 `/privacy`로 서빙한다.
- 앱 라우트(`src/app/`)로 만들지 않은 이유: `src/app/_layout.tsx`의 인증 게이트가
  로그인하지 않은 방문자를 `/onboarding`으로 보내 버린다. 심사자와 테스터는 로그인 없이
  이 URL을 열기 때문에 라우트로 만들면 방침 페이지가 보이지 않는다.
- **HealthKit을 쓰는 앱은 개인정보처리방침 URL이 필수**다(App Review Guideline 5.1.3).
  URL을 비워 두면 베타 심사 단계에서 바로 반려된다.
- 입력 위치는 두 곳이고 서로 다른 칸이다. 둘 다 채운다.
  - App Store Connect → 앱 정보(App Information) → 개인정보 처리방침 URL
  - TestFlight → 테스트 정보(Test Information) → 개인정보 처리방침 URL

> 방침 본문의 문의 이메일은 현재 `cby9017@gmail.com`이다. 팀 공용 주소가 있으면
> `public/privacy.html`의 9번 항목에서 바꾸고 재배포한다.

---

## 2. 사용권 계약 (EULA)

기본값은 Apple 표준 EULA다. 그대로 써도 심사에는 문제가 없지만, 이 앱에는 표준 EULA가
다루지 않는 사정이 있다 — **베타 종료 시 데이터 파기, AI가 쓴 문장의 부정확성, 걸음 수는
의료 정보가 아니라는 고지, 회원가입 없이 운영자가 발급하는 계정**. 그래서 커스텀 EULA를
준비했다.

- 붙여 넣을 원본: `docs/eula.txt` (App Store Connect는 **일반 텍스트만** 받는다)
- 웹 공개본: `https://walk-diary-frontend.vercel.app/terms` (`public/terms.html`)
- 두 파일은 같은 내용의 쌍이다. **한쪽만 고치면 앱스토어 문안과 웹 문안이 갈라진다.**

입력 위치: App Store Connect → 해당 앱 → **앱 정보(App Information) → 라이선스 계약** →
“선택한 모든 국가 또는 지역에 커스텀 EULA 적용”을 고르고 `docs/eula.txt` 전문을 붙여 넣는다.
TestFlight 화면의 테스트 정보에 라이선스 계약 입력란이 보이면 같은 텍스트를 넣는다.
TestFlight 테스터는 이와 별개로 Apple의 TestFlight 이용약관에도 동의하게 된다.

🔴 **커스텀 EULA를 쓰면 Apple이 정한 최소 조항을 반드시 포함해야 한다.** `docs/eula.txt`는
아래 10개를 모두 담고 있다 — 문안을 줄이거나 조항을 삭제할 때 이 대응표를 확인한다.

| Apple 최소 조항 | 해당 조문 |
| --- | --- |
| Acknowledgement (계약 상대는 Apple이 아님) | 제1조 |
| Scope of License (양도 불가, Apple 상표 제품) | 제5조 |
| Maintenance and Support (Apple은 의무 없음) | 제12조 |
| Warranty (환불 외 Apple 무보증) | 제13조 |
| Product Claims (이용자·제3자 청구는 개발자 책임) | 제15조 |
| Intellectual Property Rights (침해 주장 방어 책임) | 제16조 |
| Legal Compliance (금수국·제한 당사자 목록) | 제17조 |
| Developer Name and Address (문의처) | 제22조 |
| Third Party Terms (통신사 약관 등 준수) | 제18조 |
| Third Party Beneficiary (Apple의 집행권) | 제19조 |

> 이 문서들은 법률 자문이 아니다. 팀이 실제 서비스로 확장한다면 변호사 검토를 받는 것이
> 맞다. 지금 문안은 베타 범위에서 코드로 확인된 사실만 반영한 것이다.

---

## 3. TestFlight 테스트 정보 (Test Information)

### 베타 앱 설명 (Beta App Description)

```
Mowa는 산책을 감지해 일기로 남겨 주는 앱입니다.

따로 시작 버튼을 누르지 않아도, 앱이 백그라운드에서 걷기 활동을 인식해 산책이 끝나면
"오늘 산책, 기록해 볼까요?" 하고 알림을 보냅니다. 알림을 열면 사진과 함께 누구와,
어떤 기분으로, 어떤 상황에서 걸었는지만 고르면 되고, 나머지 문장은 AI가 대신 써 줍니다.

이번 베타에서 확인하고 싶은 것
1. 실제로 걸었을 때 산책이 제때 감지되는지 (10분 내외의 산책 기준)
2. 감지 후 알림이 적절한 시점에 오는지, 너무 잦거나 늦지는 않은지
3. AI가 써 준 일기가 내 산책처럼 읽히는지
4. 배터리 소모가 견딜 만한지

베타 기간에는 회원가입이 없습니다. 운영자가 드린 계정으로 로그인해 주세요.
문제가 생기면 TestFlight의 피드백 보내기나 아래 이메일로 알려 주시면 됩니다.
```

### 피드백 이메일 (Feedback Email)

```
cby9017@gmail.com
```

### 테스트할 내용 / What to Test (선택 입력)

```
1. 로그인 → 권한 4종(위치 항상 허용, 동작 및 피트니스, 알림, 사진) 허용
2. 밖에서 10분 이상 걷기 → 산책 감지 알림 확인
3. 알림 탭 → 사진·동행·감정·상황 선택 → AI 일기 생성 → 저장
4. 아카이브에서 저장한 기록 확인 / 수정 / 삭제
5. 하루 이상 사용해 보고 배터리 소모와 알림 빈도에 대한 느낌 회신
```

---

## 4. 베타 앱 심사 정보 (Beta App Review Information)

> 외부 테스터(오픈 베타/공개 링크)를 쓰려면 이 항목이 필수이고, 빌드마다 Apple의
> 베타 앱 심사를 통과해야 한다. 내부 테스터(팀 100명)만 쓸 때는 심사가 없다.

### 로그인 필요 (Sign-in required): **예**

| 칸 | 값 |
| --- | --- |
| 사용자 이름 (Demo account) | `.env`의 `EXPO_PUBLIC_MOCK_LOGIN_ID` 값 — **저장소에 적지 않는다** |
| 암호 (Password) | `.env`의 `EXPO_PUBLIC_MOCK_PASSWORD` 값 |

심사 전에 이 계정이 **배포된 백엔드**에 살아 있는지 반드시 확인한다. mock 서버의
`mowa01` 계정은 실서버에 존재하지 않는다.

### 연락처 정보 (Contact Information)

이름·성·전화번호·이메일 — 실제로 연락이 닿는 값으로 채운다. 전화번호는 국가번호를
포함한 형식(`+82 10-XXXX-XXXX`)으로 적는다.

### 비고 / 심사용 추가 정보 (App Review Notes)

붙여 넣을 원본: **`docs/review-notes.txt`** — 마크다운 없는 순수 텍스트다. 파일 전체를
그대로 복사해 넣으면 된다.

- 이 칸의 상한은 **4,000자**다. 현재 원문은 줄바꿈 포함 **2,690자**로 여유가 있다.
  문구를 덧붙일 때는 `python3 -c "print(len(open('docs/review-notes.txt').read()))"`로
  다시 세어 본다.
- 본문은 영문이다. 화면에 실제로 보이는 한글 버튼 이름("개발자 진단 열기")만 한글 그대로
  두고 영문 설명을 괄호로 붙였다 — 심사자가 그 글자를 눈으로 찾아야 하기 때문이다.
- 내용은 번호가 붙은 8개 항목이다. 앱 소개 / 데모 계정 / **걷지 않고 심사하는 6단계
  절차** / "항상 허용" 위치와 백그라운드 모드의 근거 / HealthKit 읽기 전용 / 로컬 알림 /
  방침·EULA 링크 / 연락처.

### 비고 — 국문 (팀 공유용, 붙여 넣기용 아님)

핵심은 세 가지다. ① 걷지 않고도 심사할 수 있는 경로(`/debug`의 Synthetic FINISHED walk),
② "항상 허용" 위치와 백그라운드 모드가 왜 필요한지, ③ HealthKit은 읽기 전용이며
서버로 나가지 않는다는 점. 이 셋이 빠지면 백그라운드 위치와 HealthKit 때문에 반려될
확률이 높다.

---

## 5. App Privacy(개인정보 보호) 설문 답안

App Store Connect → 앱 개인정보 보호. Apple 기준으로 “수집(collect)”은 **데이터가 기기
밖으로 나가는 것**을 뜻한다. 기기 안에서만 쓰이는 값은 수집이 아니다.

| 데이터 유형 | 수집 | 연결됨 | 추적 | 목적 | 근거 |
| --- | --- | --- | --- | --- | --- |
| User ID (로그인 ID) | 예 | 예 | 아니요 | 앱 기능 | `src/api/types.ts` `LoginRequest` |
| Name (닉네임) | 예 | 예 | 아니요 | 앱 기능 | `MeResponse.nickname` |
| Coarse Location (동 단위 문구) | 예 | 예 | 아니요 | 앱 기능 | `WalkCandidate.locationSummary` |
| Precise Location | **아니요** | — | — | — | 좌표는 기기 밖으로 안 나감 (`location.native.ts`) |
| Photos or Videos | 예 | 예 | 아니요 | 앱 기능 | `src/lib/cloudinary-upload.ts` |
| Other User Content (일기 본문·감정·태그) | 예 | 예 | 아니요 | 앱 기능 | `CreateWalkExperienceRequest` |
| Health & Fitness (걸음 수) | **아니요** | — | — | — | 기기 내에서만 사용 (`health.native.ts`) |
| Contact Info / 결제 / 광고 식별자 / 진단 | 아니요 | — | — | — | 해당 SDK 없음 |

“이 앱은 사용자를 추적하지 않습니다” — App Tracking Transparency 대상 아님.

---

## 6. 제출 전 점검 목록

- [ ] **백엔드가 심사 기간 내내 켜져 있어야 한다.** 로그인이 실패하면 심사자는 아무것도
      못 보고 바로 반려한다. OCI 인스턴스가 자동 중지되지 않는지 확인한다.
- [ ] 데모 계정이 배포 백엔드에서 실제로 로그인되는지 심사 직전에 한 번 더 확인한다.
- [ ] 빌드가 `.env`의 **배포 백엔드 URL(HTTPS)** 로 빌드되었는지 확인한다.
      `EXPO_PUBLIC_*`는 빌드 시점에 값이 박히므로, LAN IP로 빌드된 바이너리를 올리면
      심사자 기기에서 통신이 전부 실패한다.
- [ ] Cloudinary 환경변수가 빌드에 포함되어 있어야 사진 첨부가 동작한다.
- [ ] `grep -c aps-environment ios/*/*.entitlements`가 0인지 확인한다(프리빌드 후).
- [ ] 아카이브 업로드 시 **수출 규정(Export Compliance)** 질문이 뜬다. HTTPS만 쓰므로
      면제 대상이다. 매 빌드마다 답하기 싫으면 `app.json`의 `ios.infoPlist`에
      `"ITSAppUsesNonExemptEncryption": false`를 넣고 프리빌드한다(`npm run prebuild`).
- [ ] 토큰 유효 기간이 1시간이다. 심사가 길어지면 중간에 로그인 화면으로 튕길 수 있다는
      점을 알고 있어야 한다(비고에는 굳이 적지 않았다).

### 오픈 베타의 구조적 제약 — 먼저 결정해야 한다

이 빌드에는 **회원가입이 없다**(`src/app/login.tsx`, `api-spec.md:1071` “회원가입은 MVP에서
제외합니다”). 공개 링크로 배포하면 링크를 받은 사람은 앱을 설치할 수는 있어도
**계정이 없어 로그인 화면에서 멈춘다.** 선택지는 셋이다.

1. 테스터 수를 제한하고 계정을 사람마다 발급해 개별 전달한다(가장 현실적).
2. 공용 테스트 계정 하나를 링크와 함께 공지한다 — 모든 테스터가 같은 일기를 보게 되고
   서로의 기록을 지울 수 있다.
3. 백엔드에 회원가입을 추가한다 — 추가되면 Apple은 **앱 내 계정 삭제 기능**도 요구한다
   (Guideline 5.1.1(v)). 지금은 회원가입이 없어 이 요구가 적용되지 않는다.
