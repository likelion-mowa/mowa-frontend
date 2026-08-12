# Project Overview

Mowa detects a walk, offers to record it, and turns it into an AI-written diary entry.
Ship target is a hackathon submission with two deliveries.

- Deliver two builds at all times: a web link as the safety net, an iOS demo video for walk detection.
  `e.g. breaking web to fix iOS is never an acceptable trade.`
- Treat iOS as the full product and web as UI-only.
  `e.g. walk detection, HealthKit, notifications and background location are iOS-only.`
- Build iOS as an Expo Development Build, never Expo Go.
  `e.g. Expo Go cannot load modules/walk-detector or HealthKit.`
- Walk detection logic is not written yet. This repo currently holds the environment and a stub.
  `e.g. modules/walk-detector returns canned values on purpose.`
- Read the prior investigation before designing detection.
  `e.g. /Users/cby/workspace/ios-movement-test/docs/03-findings.md has measured keepalive settings.`

# Stack + Version

- Never bump `expo`, `react-native` or `react` independently of each other.
  `e.g. expo 57.0.12 / react-native 0.86.2 / react 19.2.3.`
- Use npm. Never pnpm or yarn.
  `e.g. pnpm symlinks silently made Tailwind emit zero utility classes in the prior repo.`
- Keep Tailwind on v3.
  `e.g. tailwindcss 3.4.19 — react-native-css-interop 0.2.6 declares peer "~3".`
- Keep NativeWind on v4, not the v5 preview.
  `e.g. nativewind 4.2.6 — v5 has an open web-export blocker.`
- Keep `react-native-nitro-modules` pinned exactly.
  `e.g. 0.35.10 exact, because HealthKit 14.0.2 generates against nitrogen ^0.35.0.`
- Keep TypeScript on 5.9.
  `e.g. typescript ~5.9.3, not the SDK 57 template's ~6.0.3.`
- Install Expo SDK packages with `expo install`, not `npm install`.
  `e.g. npx expo install expo-sqlite picks the version matching the SDK.`
- Do not add `newArchEnabled` to app.json.
  `e.g. the New Architecture is mandatory in SDK 55+ and the flag is a no-op.`

# Execute Commands

- `npm start` runs the dev server; `npm run web` runs it on web.
- `npm run prebuild` regenerates `ios/` and then strips the push entitlement.
  `e.g. run it after any change to app.json, a plugin, or modules/.`
- `npm run ios` builds and installs onto the connected iPhone.
  `e.g. npm run ios → installs Mowa on device "by".`
- `npm run ios:clean` when unsure. It prebuilds first, then runs.
  `e.g. always use this for the first build in a fresh clone.`
- `npm run typecheck` before every commit.
- `npm run export:web` then `npm run serve:web` to check the real static build.
- `npm run mock` runs the local mock backend; `npm run mock:test` checks it against the spec.
  `e.g. http://localhost:4000/api/v1 — accounts and caveats in mock/README.md.`
- The mock needs Node 22.6+ because it imports `src/api/types.ts` directly.
  `e.g. --experimental-strip-types is what keeps its code values from drifting from the app's.`
- The mock is local only. Never point the deployed web build at it.
  `e.g. a judge's browser resolves localhost to their own machine, and HTTPS blocks http://.`
- Vercel builds from `vercel.json`; never add an SPA rewrite to it.
  `e.g. web.output is "static", so rewriting /:path* to / would break every route.`
- `npm run patch:jsi` only when the iOS build fails to compile expo-modules-jsi.
  `e.g. see Known Traps.`
- Install CocoaPods from Homebrew, not gem.
  `e.g. brew install cocoapods → 1.17.0; gem's bindir is not on PATH.`
- `npm run ios` prompts for a device. Pass the UDID to run it non-interactively.
  `e.g. npx expo run:ios --device 00008140-0005150A1E93001C.`

# Verification Loop

Run these four gates in order. Never claim work is done without pasting their output.

- Gate 1 — types. `npx tsc --noEmit` must exit 0.
  `e.g. run npx expo start once first, or expo-env.d.ts is missing and errors are spurious.`
- Gate 2 — web renders. `npm run web`, then confirm the browser console is empty.
  `e.g. "Cannot find native module" in console means an adapter leaked.`
- Gate 3 — web export. `npm run export:web` must exit 0 and write `dist/`.
  `e.g. dist/index.html plus dist/_expo/static/js/web/*.js.`
- Gate 4 — no native code in the web bundle. `npm run verify:web` exports and checks in one step.
  `e.g. scripts/check-web-bundle.mjs exits 1 on a leak OR on a missing positive control.`
- Grep for module specifiers, never for prose.
  `e.g. "healthkit" matches the word HealthKit in UI copy and gives a false positive.`
- Confirm the split positively, not just negatively.
  `e.g. the web bundle SHOULD contain "HealthKit is only available on iOS." from health.ts.`
- Decode `\uXXXX` before checking the bundle for Korean copy.
  `e.g. measured — 생각에 잠긴 ships as \uc0dd\uac01\uc5d0 \uc7a0\uae34, so a raw grep reports a false MISSING.`
- A types-only module that nothing imports is absent from the bundle and unverifiable.
  `e.g. src/api/types.ts is reachable only because /debug renders its code values.`
- Gate 5 — device. `npm run ios` must install and launch on a physical iPhone.
  `e.g. a green simulator build proves nothing about motion or HealthKit.`
- Never treat a green `tsc` as proof the web build works.
  `e.g. expo/tsconfig.base sets customConditions ["react-native"], so tsc types web files natively.`
- Know what each gate cannot catch. A native import inside a screen passes Gate 1 and fails Gate 4.
  `e.g. skipping the bundle grep ships a broken web build with a green typecheck.`
- Re-run `npm run prebuild` after any app.json or plugin change, then re-check the push entitlement.
  `e.g. grep -c aps-environment ios/*/*.entitlements must print 0.`
- Test permission dialogs only on a fresh install.
  `e.g. delete the app from the phone first; iOS shows each prompt once.`
- Verify walk detection on hardware only.
  `e.g. the simulator has no motion coprocessor and an empty HealthKit store.`
- Log every suppressed or skipped path.
  `e.g. silent failure was the single most expensive failure class in the prior repo.`

# Directory Structure & File Placement Rule

- Put routes in `src/app/`, one file per screen.
  `e.g. src/app/archive.tsx serves /archive.`
- Keep developer diagnostics on `/debug`, never on `/`.
  `e.g. the root route is what a hackathon judge opens on the deployed web URL.`
- Put every native capability behind `src/adapters/`.
  `e.g. src/adapters/health.native.ts.`
- Name the base file for web and the `.native.ts` file for iOS.
  `e.g. storage.ts is the in-memory mock, storage.native.ts is SQLite.`
- Make the base file a real module, never a declaration stub.
  `e.g. tsc only ever resolves the base file, so it defines the types for all callers.`
- Keep all port interfaces in `src/adapters/types.ts`.
  `e.g. export interface StoragePort { ... }.`
- Adding a capability backed by an Expo package means editing three files.
  `e.g. types.ts (port) + x.ts (web value) + x.native.ts (real impl).`
- Adding one backed by a local `modules/` module means five, and Swift is not checked.
  `e.g. + modules/.../WalkDetectorModule.ts declare class + the Swift AsyncFunction.`
- Omitting the Swift side still passes `tsc`. It fails only at runtime on device.
  `e.g. measured — no gate in this repo covers the Swift side of the bridge.`
- Annotate both implementations with the port type so a one-sided edit cannot compile.
  `e.g. export const storage: StoragePort = { ... } in BOTH files.`
- Renaming a shared field is caught by tsc; adding one is not.
  `e.g. nothing in TS constructs a WalkEvent, so widening the type compiles clean.`
- Metro never considers `.native.ts` on web, so a native import there is unreachable from the web graph.
  `e.g. web resolves x.web.ts then x.ts; ios resolves x.ios.ts then x.native.ts then x.ts.`
- Put Swift in `modules/<name>/ios/`.
  `e.g. modules/walk-detector/ios/WalkDetectorModule.swift.`
- Reference `modules/` from exactly one place, and only from a `.native.ts` file.
  `e.g. walk-detector.native.ts imports '../../modules/walk-detector'.`
- Put native build configuration in `app.json` or `plugins/`.
  `e.g. plugins/with-development-team.js pins the signing team.`
- Put shared client state in `src/stores/`.
  `e.g. src/stores/diagnostics-store.ts.`
- Keep the backend contract in `src/api/types.ts`, separate from the adapter ports.
  `e.g. adapters/types.ts is device capabilities; api/types.ts is what the server sends.`
- Keep the backend spec itself in `docs/backend/`.
  `e.g. erd.md, api-spec.md, data-tables.md, design-changes-2026-08-10.md.`

# Code Convention

- Keep TypeScript strict and avoid `any` in `src/`.
  `e.g. take unknown and narrow it with a type guard.`
- Name files in kebab-case and components in PascalCase.
  `e.g. walk-card.tsx exports WalkCard.`
- Import app code through the `@/` alias.
  `e.g. import { walkDetector } from '@/adapters'.`
- Annotate every adapter export with its port type.
  `e.g. export const storage: StoragePort = { ... }.`
- Return results from adapters; never throw for "unsupported".
  `e.g. return { ok: false, error: 'HealthKit is only available on iOS.' }.`
- Wrap every native call in try/catch and normalize the error.
  `e.g. catch (error) { return toError(error) }.`
- Write comments that explain why, in English.
  `e.g. // CoreMotion has no permission API; issuing a query IS the prompt.`

# Styling Rule

- Style with NativeWind `className`, not `StyleSheet`.
  `e.g. <View className="flex-1 px-4" />.`
- Use Tailwind v3 syntax only.
  `e.g. v4's @theme and CSS-first config will not compile.`
- Import `global.css` exactly once, in the root layout.
  `e.g. src/app/_layout.tsx imports '../../global.css'.`
- Add new source directories to the Tailwind `content` globs or their classes are dropped.
  `e.g. content: ['./src/**/*.{js,jsx,ts,tsx}'].`
- Define colors in the Tailwind theme instead of inlining hex values.
  `e.g. className="bg-walk" resolves to #3F8F5A.`
- Avoid `transition-*` and `animate-*` classes until someone verifies them on device.
  `e.g. NativeWind 4.2.6 with Reanimated 4.5.1 is unproven here.`
- Ignore the broken LogBox rendering in development.
  `e.g. nativewind#1834 on RN 0.86 — cosmetic, dev-only, production is unaffected.`

# Data/State Rule

- Keep client state in Zustand, one store per domain.
  `e.g. src/stores/diagnostics-store.ts.`
- Let stores call adapters, never native modules.
  `e.g. import { storage } from '@/adapters'.`
- Persist through `StoragePort` so both platforms compile.
  `e.g. expo-sqlite on iOS, localStorage on web — both survive a reload.`
- Do not invent product design. Derive every field, code value and label from `docs/backend/`.
  `e.g. emotion codes come from api-spec.md §3, not from a guess about the UI.`
- Treat `docs/backend/` as a mirror, not the origin. Notion is upstream.
  `e.g. re-export the pages after a backend change instead of hand-editing the markdown.`
- Model the three backend entities separately; they are not one record.
  `e.g. walk_candidates → experience_drafts → walk_experiences, each 1:0..1.`
- Keep client-only fields out of the server contract, and say which they are.
  `e.g. steps is a detection signal — no backend table has a steps column.`
- Send instants as ISO 8601 with offset, never epoch milliseconds.
  `e.g. the detector reports epochMs; convert with toIsoDateTime at the boundary.`
- Treat `emotions[]` and `tags[]` as whole-array replacements on PATCH.
  `e.g. omit to keep, [] to clear, a list to replace — there is no partial add.`
- Use only the async expo-sqlite API, and open the database lazily.
  `e.g. await SQLite.openDatabaseAsync('mowa.db') inside init(), not at module scope.`
- Bump `PRAGMA user_version` when the SQLite schema changes.
  `e.g. CREATE TABLE IF NOT EXISTS silently keeps the old columns on an installed device.`
- Never use expo-sqlite on web.
  `e.g. its web backend is alpha and needs COOP/COEP headers expo export does not emit.`
- Never infer "permission denied" from an empty HealthKit result.
  `e.g. HealthKit never discloses read authorization; denied and no-data look identical.`
- Use camelCase for API JSON fields.
  `e.g. { photoUrl, startedAt }.`
- Keep secrets out of the repo.
  `e.g. read process.env.EXPO_PUBLIC_* and leave .env untracked.`

# Negative Constraints

- Never import a native module or iOS-only package from a screen, component, or store.
  `e.g. importing expo-sqlite in a screen breaks the web bundle.`
- Never put a native import in a base file.
  `e.g. web resolves health.ts and never health.native.ts.`
- Never edit anything under `ios/` or `android/`.
  `e.g. expo prebuild --clean deletes both on every run; use a config plugin.`
- Never skip `strip-aps` after a prebuild.
  `e.g. aps-environment makes free-team signing fail outright.`
- Never run `npm run ios` before a first prebuild in a fresh clone.
  `e.g. strip-aps no-ops, run:ios regenerates the entitlement, and signing fails.`
- Never switch to pnpm or yarn.
  `e.g. symlinked node_modules break Expo autolinking and Tailwind scanning.`
- Never upgrade to Tailwind v4 or NativeWind v5.
  `e.g. both are known-broken for this stack today.`
- Never let `react-native-nitro-modules` float.
  `e.g. keep the exact pin; a mismatch surfaces as an opaque pod build error.`
- Never trust the simulator for motion, HealthKit, or background location.
  `e.g. CMMotionActivityManager.isActivityAvailable() returns false there.`
- Never add remote push or `aps-environment`.
  `e.g. all notifications are local; remote push needs a paid Apple account.`
- Never commit `ios/`, `android/`, `dist/`, `.expo/`, or signing material.
  `e.g. *.mobileprovision is gitignored — keep it that way.`
- Never lower location accuracy to save battery in the detection layer.
  `e.g. measured: low accuracy suspends the app and kills background detection entirely.`

## Known Traps

These all present as "it mysteriously stopped working". Check them before debugging code.

- The team is a PAID Apple Developer Program Individual membership, team `X4RZSKR6X3`.
  `e.g. profiles are valid 1 year; the free-tier 7-day expiry and 3-app cap no longer apply.`
- Upgrading a free Personal Team keeps the same Team ID, so signing config needs no change.
  `e.g. plugins/with-development-team.js still pins X4RZSKR6X3 and is correct.`
- `expo-modules-jsi` 57.0.4 does not compile on Xcode 26.2. Confirmed on this repo, not theoretical.
  `e.g. JavaScriptCodable+Date.swift:53 "type of expression is ambiguous without a type annotation".`
- The patch is wired into `postinstall` because npm install reverts it and the build then fails.
  `e.g. scripts/patch-expo-jsi.mjs runs automatically; it no-ops once upstream fixes this.`
- Xcode 26.2 is the pinned toolchain. Do not upgrade without re-verifying the whole build.
  `e.g. the full device build passes on 26.2 with the patch; upgrading buys nothing today.`
- If someone does upgrade to 26.4+, clear the SPM cache before judging the result.
  `e.g. rm -rf node_modules/expo-modules-jsi/apple/.DerivedData, or the stale cache hides it.`
- A free-team build installs but will not launch until the certificate is trusted on the device.
  `e.g. Settings > General > VPN & Device Management > Developer App > trust your Apple ID.`
- Signing errors during a raw `xcodebuild` run are usually a missing flag, not a real problem.
  `e.g. expo run:ios passes -allowProvisioningUpdates; plain xcodebuild does not.`
- `expo prebuild` cleans by default in SDK 57.
  `e.g. any manual Xcode change, including the signing team, is discarded.`
- Motion & Fitness must be enabled system-wide.
  `e.g. Settings > Privacy & Security > Motion & Fitness > Fitness Tracking.`
- Entitlement plugins run in REVERSE registration order. Registering last means running first.
  `e.g. with-no-push-entitlement must stay FIRST in app.json plugins or its delete is a no-op.`
- That failure is silent: the plugin still runs, just before the key it deletes exists.
  `e.g. verify after prebuild by grepping the generated entitlements for aps-environment.`

# Git/PR Convention

Source of truth: the team's `Git 협업 규칙` document. There is no `develop` branch —
`main` is the integration branch.

- Update `main` before creating any branch.
  `e.g. git checkout main && git pull origin main.`
- Branch from the latest `main`, using `feature/{기능명}` or `fix/{수정내용}`.
  `e.g. git checkout -b feature/walk-record.`
- Never develop on `main` and never push to it directly.
  `e.g. every change reaches main through a pull request.`
- Write commits as `타입: 작업 내용`.
  `e.g. feat: 산책 기록 화면 구현.`
- Use only these types: feat, fix, refactor, test, docs, style, chore.
  `e.g. chore: 프로젝트 의존성 설정.`
- Keep one meaningful change per commit.
  `e.g. "수정", "작업 완료", "최종" are not acceptable messages.`
- Title pull requests `[Feat] …`, `[Fix] …` — bracketed, capitalized.
  `e.g. [Feat] 산책 기록 화면 구현.`
- Use the PR body template: `## 작업 내용` then `## 확인 사항`.
  `e.g. put the verification gate output under 확인 사항.`
- Scope each PR to one feature or one tracker item.
- Re-sync `main` after a merge, before starting the next branch.
  `e.g. git checkout main && git pull origin main.`
- Delete merged branches.
  `e.g. git branch -d feature/walk-record.`
- Announce before editing shared files someone else owns.
  `e.g. common components, common config, shared types.`
- Coordinate API request/response changes with the backend before merging.
  `e.g. never change field names unilaterally.`
- Never commit secrets. Share real values off GitHub.
  `e.g. .env is gitignored; commit .env.example with the values stripped.`
