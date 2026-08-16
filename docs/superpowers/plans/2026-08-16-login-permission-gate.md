# Login → Home Permission Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a user signs in (or restores a session), route them through a new `/permissions` screen when location or notification permission is still undetermined, before they reach home — without ever storing a "seen it" flag.

**Architecture:** A fourth branch is added to the existing imperative gate in `src/app/_layout.tsx` (the app's only navigator). It reads live OS permission state via the existing `location`/`notifications` adapters — no new store, no new persisted key. A new route `src/app/permissions.tsx` offers per-permission request buttons (never a bulk request) and a single "시작하기" button that is simultaneously "proceed" and "skip". A cold-start notification tap always wins over the gate.

**Tech Stack:** Expo Router (typed routes, imperative `router.replace`), Zustand (`useAuth` only — no new store), existing adapters `location.native.ts` / `location.ts`, `notifications.native.ts` / `notifications.ts`, `system-settings.native.ts`.

**Spec:** This plan implements the design captured in memory file `login-permission-gate-plan.md` (session memory at `/Users/cby/.claude/projects/-Users-cby-workspace-walk-diary-frontend/memory/login-permission-gate-plan.md`), which is itself derived from the current code in this repo (`_layout.tsx`, `auth-store.ts`, adapters). That memory doc records the user's confirmed product decisions; this plan translates them into exact file edits.

## Global Constraints

- Location and notifications only. Motion, HealthKit, camera are explicitly excluded (Motion has no permission API — `AGENTS.md:151`).
- Skippable. There is no separate skip button — the single "시작하기" CTA is the skip.
- No new persisted key. OS permission state IS the memory; once a permission leaves `prompt` (granted or denied), the row stops prompting.
- Interaction is per-permission buttons (design "A안"), never a single bulk "허용" action.
- `RootLayout` must never early-return (`reactCompiler` is on — see `_layout.tsx:156-157`); the new branch is a fourth condition inside the existing gate `useEffect`, not a conditional render.
- Use imperative `router.replace`, never `<Redirect>`, inside the layout (`<Redirect>` does not work from a layout — `_layout.tsx:166-167`).
- Do **not** add `/permissions` to `AUTH_ROUTES` in `_layout.tsx:23` — it is only reachable after sign-in, so it is a protected route.
- Do not touch `src/app/login.tsx` or `src/stores/auth-store.ts` — `signIn` only changes state; the layout gate does all navigation (`login.tsx:28-29`, `auth-store.ts:19-21`).
- Do not reuse `src/app/settings/permissions.tsx` for this flow — it is intentionally request-free (`photo-picker.native.ts:39-41`): "권한 화면은 절대 프롬프트를 띄우면 안 된다 — iOS는 설치당 한 번만 보여주는데 상태 조회에 그 기회를 쓰면 복구 불가능하다." Build a new route instead.
- This repo has no unit test framework (no jest/pytest config, no `*.test.*` files — confirmed by search during planning). Verification is the project's own gate sequence from `AGENTS.md` (`npx tsc --noEmit`, `npm run web`, `npm run export:web`, `npm run verify:web`, on-device `npm run ios`), not authored unit tests. Each task below substitutes the applicable subset of that sequence for a "run the tests" step.
- `npm run lint` is known to rewrite the lockfile — do not run it as part of verification (see memory `repo-command-traps.md`).

---

## Setup: branch

- [ ] **Step 1: Sync `main` and branch**

```bash
git checkout main
git pull origin main
git checkout -b feature/login-permission-gate
```

Per `AGENTS.md` Git/PR convention: branch from latest `main`, `feature/{기능명}` naming, never commit directly to `main`.

---

## File Structure

- **Modify:** `src/app/_layout.tsx`
  - `useNotificationTapRouting` (currently lines 85–103): refactored to return `boolean | null` so the permission gate can tell "a cold-start tap is being routed" apart from "no tap, decide on permissions."
  - `RootLayout` (currently lines 148–232): new `needsPermissions` state, a `visitedPermissionsRef`, a fourth branch in the existing gate effect (currently lines 166–175), and a widened flash-guard overlay condition (currently lines 227–229).
- **Create:** `src/app/permissions.tsx` — the new screen. Self-contained: reads `location`/`notifications`/`systemSettings` adapters directly, no store.
- **Untouched:** `src/app/login.tsx`, `src/stores/auth-store.ts`, `src/adapters/*`, `src/app/settings/permissions.tsx`, `app.json` (no new plugin/entitlement — location and notifications are already configured).

---

### Task 1: Expose whether a cold-start notification tap was found

**Files:**
- Modify: `src/app/_layout.tsx:1` (import), `src/app/_layout.tsx:85-103` (`useNotificationTapRouting`), `src/app/_layout.tsx:177` (call site)

**Interfaces:**
- Consumes: existing `notifications.getInitialResponse()`, `notifications.addResponseListener()`, `routeNotificationTap()` — no signature changes to any of these.
- Produces: `useNotificationTapRouting(signedIn: boolean): boolean | null` — `null` while signed out or the initial-response check is still pending, `true` once a cold-start tap was found and routed, `false` once confirmed there was none (or the check failed). Task 3 consumes this return value.

This is a pure refactor: today the hook swallows the "was there a tap" result entirely. Nothing about *when* `getInitialResponse()` is called, or how many times, changes — it must stay a single call per `signedIn` transition, because it's consuming (`notifications.native.ts:80-95` — iOS remembers the last response until cleared, so calling it twice loses the tap on the second call).

- [ ] **Step 1: Add `useState` to the React import**

`src/app/_layout.tsx:1` currently reads:

```tsx
import { useEffect, useRef, type PropsWithChildren } from 'react';
```

Change to:

```tsx
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
```

- [ ] **Step 2: Rewrite `useNotificationTapRouting` to return tap status**

Replace the whole function at `src/app/_layout.tsx:85-103`:

```tsx
function useNotificationTapRouting(signedIn: boolean): boolean | null {
  const [hasInitialTap, setHasInitialTap] = useState<boolean | null>(null);

  useEffect(() => {
    notifications.setForegroundHandler();
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setHasInitialTap(null);
      return;
    }

    void notifications.getInitialResponse().then((result) => {
      if (!result.ok) {
        console.log(`[MOWA] notif initial response FAILED — ${result.error}`);
        setHasInitialTap(false);
        return;
      }
      if (result.value !== null) {
        routeNotificationTap(result.value);
        setHasInitialTap(true);
        return;
      }
      setHasInitialTap(false);
    });

    return notifications.addResponseListener(routeNotificationTap);
  }, [signedIn]);

  return hasInitialTap;
}
```

- [ ] **Step 3: Update the call site to capture the return value**

`src/app/_layout.tsx:177` currently reads:

```tsx
  useNotificationTapRouting(signedIn);
```

Change to:

```tsx
  const hasInitialTap = useNotificationTapRouting(signedIn);
```

(Task 3 adds the code that reads `hasInitialTap`; it is an unused variable for the duration of this task only — that is expected and resolves in Task 3, not a bug to fix here.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `expo-env.d.ts` is missing, run `npx expo start` once first per `AGENTS.md` Gate 1 note.)

Expected transient warning: `hasInitialTap` declared but never read — this disappears once Task 3 lands. If `tsc` reports anything else, stop and investigate before continuing.

- [ ] **Step 5: Manual smoke check (web)**

Run: `npm run web`. Confirm the browser console has no new errors and the existing login → home flow still works exactly as before (this refactor changes no runtime behavior on its own).

- [ ] **Step 6: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "refactor: 알림 탭 감지 결과를 훅 반환값으로 노출"
```

---

### Task 2: Build the `/permissions` screen

**Files:**
- Create: `src/app/permissions.tsx`

**Interfaces:**
- Consumes: `location.getPermission()` / `requestForegroundPermission()` / `requestBackgroundPermission()` (`LocationPort`, `src/adapters/types.ts:165-180`); `notifications.getPermission()` / `requestPermission()` (`NotificationsPort`, `types.ts:97-118`); `systemSettings.open()` / `.isAvailable` (`SystemSettingsPort`, `types.ts:284-287`); `SettingsRow`, `SettingsSection` from `@/components/settings-ui`; `IcLocation`, `IcBell` from `@/components/icons`; `colors` from `@/lib/theme`; `router` from `expo-router`.
- Produces: the route `/permissions`, reachable by `router.replace('/permissions')` (wired in Task 3) and directly by URL on web. Its only outbound navigation is `router.replace('/')` from the "시작하기" button — it never calls `router.back()` (no back affordance; only reachable via `replace`, so there is nothing to pop to).

This screen is independently testable without Task 3: on web, navigating directly to `http://localhost:8081/permissions` (or the `npm run web` dev URL) renders it standalone.

- [ ] **Step 1: Write the file**

```tsx
import { useCallback, useState } from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { location, notifications, systemSettings, type PermissionState } from '@/adapters';
import { PrimaryButton } from '@/components/buttons';
import { IcBell, IcLocation } from '@/components/icons';
import { SettingsRow, SettingsSection } from '@/components/settings-ui';
import { colors } from '@/lib/theme';

/**
 * Login → home permission gate (new — no prototype screen to match).
 *
 * Reachable only via `router.replace('/permissions')` from the root layout's
 * gate, after sign-in, while a permission is still `prompt`. There is no back
 * button: this is a `replace` target, not a pushed screen, and there is
 * nothing to pop to. "시작하기" is simultaneously "proceed" and "skip" — see
 * _layout.tsx for why a second skip button is deliberately absent.
 *
 * Unlike `/settings/permissions`, THIS screen requests. Buttons appear only
 * while a permission is `prompt`, because the iOS system prompt is shown once
 * per install — a button that fires a second request would just silently
 * return the already-decided value.
 */

type LocationRowState =
  | { kind: 'prompt' }
  | { kind: 'foreground-only' }
  | { kind: 'always' }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

function describeLocation(
  result: Awaited<ReturnType<typeof location.getPermission>>,
): LocationRowState {
  if (!result.ok) return { kind: 'unavailable' };
  const { foreground, background } = result.value;
  if (foreground === 'unavailable') return { kind: 'unavailable' };
  if (foreground === 'denied') return { kind: 'denied' };
  if (background === 'granted') return { kind: 'always' };
  if (foreground === 'granted') return { kind: 'foreground-only' };
  return { kind: 'prompt' };
}

function RowActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-full bg-sage px-3 py-1.5 active:opacity-70">
      <Text className="text-xs font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

function RowLabel({ text, tone }: { text: string; tone: 'muted' | 'positive' | 'negative' }) {
  const className =
    tone === 'positive'
      ? 'text-emerald-500'
      : tone === 'negative'
        ? 'text-red-500'
        : 'text-ink-muted';
  return <Text className={`text-xs font-medium ${className}`}>{text}</Text>;
}

export default function PermissionsScreen() {
  const [locationState, setLocationState] = useState<LocationRowState>({ kind: 'prompt' });
  const [notificationState, setNotificationState] = useState<PermissionState>('prompt');
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const read = useCallback(async () => {
    const [locationResult, notificationResult] = await Promise.all([
      location.getPermission(),
      notifications.getPermission(),
    ]);
    setLocationState(describeLocation(locationResult));
    setNotificationState(notificationResult.ok ? notificationResult.value : 'unknown');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void read();
    }, [read]),
  );

  const requestLocationForeground = () => {
    void location.requestForegroundPermission().then((result) => {
      setLocationState(describeLocation(result));
    });
  };

  const requestLocationBackground = () => {
    void location.requestBackgroundPermission().then((result) => {
      setLocationState(describeLocation(result));
    });
  };

  const requestNotifications = () => {
    void notifications.requestPermission().then((result) => {
      setNotificationState(result.ok ? result.value : 'unknown');
    });
  };

  const openSettings = () => {
    setSettingsError(null);
    void systemSettings.open().then((result) => {
      if (!result.ok) setSettingsError(result.error);
    });
  };

  const locationRight = (() => {
    switch (locationState.kind) {
      case 'prompt':
        return <RowActionButton label="허용" onPress={requestLocationForeground} />;
      case 'foreground-only':
        return <RowActionButton label="Always로 변경" onPress={requestLocationBackground} />;
      case 'always':
        return <RowLabel text="항상 허용됨" tone="positive" />;
      case 'denied':
        return <RowActionButton label="기기 설정 열기" onPress={openSettings} />;
      case 'unavailable':
        return <RowLabel text="해당 없음" tone="muted" />;
    }
  })();

  const locationSubtitle =
    locationState.kind === 'foreground-only'
      ? '앱 사용 중만 허용됨 — 백그라운드 감지가 동작하지 않아요'
      : '걷는 장소를 기록하고, 산책이 끝난 걸 자동으로 감지해요';

  const notificationRight =
    notificationState === 'prompt' ? (
      <RowActionButton label="허용" onPress={requestNotifications} />
    ) : notificationState === 'granted' ? (
      <RowLabel text="허용됨" tone="positive" />
    ) : notificationState === 'denied' ? (
      <RowLabel text="거부됨" tone="negative" />
    ) : (
      <RowLabel text="해당 없음" tone="muted" />
    );

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <View className="px-5 pb-2 pt-6">
        <Text className="text-lg font-bold text-ink">권한을 확인해주세요</Text>
        <Text className="mt-1 text-sm text-ink-muted">
          허용하지 않아도 계속 사용할 수 있어요. 나중에 설정에서 바꿀 수 있어요.
        </Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-8">
        <SettingsSection title="권한">
          <SettingsRow
            icon={<IcLocation size={18} color={colors.sageDark} />}
            tileClassName="bg-sage-pale"
            title="위치 접근"
            subtitle={locationSubtitle}
            divider
            right={locationRight}
          />
          <SettingsRow
            icon={<IcBell size={18} color={colors.inkMid} />}
            tileClassName="bg-amber-pale"
            title="알림"
            subtitle="산책 감지 후 기록 제안 알림"
            right={notificationRight}
          />
        </SettingsSection>

        {settingsError !== null ? (
          <Text className="mb-4 text-center text-xs text-red-500">{settingsError}</Text>
        ) : null}
      </ScrollView>

      <View className="px-6 pb-6 pt-2">
        <PrimaryButton hero glow label="시작하기" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual render check (web) — standalone**

Run: `npm run web`. Navigate directly to `/permissions` in the browser (e.g. `http://localhost:8081/permissions`).

Expected, given the web adapters return `unavailable` for both location and notifications (`location.ts:9-14`, `notifications.ts:10-15`):
- 위치 접근 row shows "해당 없음"
- 알림 row shows "해당 없음"
- "시작하기" navigates to `/` without error (harmless on web even outside the real gated flow, since it's a plain `router.replace`)
- No console errors

- [ ] **Step 4: Commit**

```bash
git add src/app/permissions.tsx
git commit -m "feat: 권한 확인 화면 추가"
```

---

### Task 3: Wire the permission gate into `RootLayout`

**Files:**
- Modify: `src/app/_layout.tsx:10` (import), `src/app/_layout.tsx:148-232` (`RootLayout`)

**Interfaces:**
- Consumes: `hasInitialTap` from Task 1's `useNotificationTapRouting`; `location.getPermission()`, `notifications.getPermission()` from the adapters; the `/permissions` route from Task 2.
- Produces: the actual gate behavior — this is the task a reviewer tests end-to-end.

Gate condition, exactly as decided: `signed-in AND (location.foreground === 'prompt' OR notifications === 'prompt') AND no cold-start notification tap`. Location's `background` field is deliberately excluded from the gate condition (only `foreground` is checked) — `background` staying `prompt` forever after the user grants `foreground` but never triggers iOS's Always upgrade dialog is an expected steady state (see Task 2's `foreground-only` row), not a reason to keep re-showing the gate on every launch. This is a judgment call beyond what the source memory doc pins down explicitly; flag it in the PR description as an assumption for team review, per `AGENTS.md`'s "don't invent product design" rule.

The `visitedPermissionsRef` exists to solve one race: pressing "시작하기" (skip) calls `router.replace('/')`, which lands back on a route where, without this guard, `needsPermissions` would still read `true` and the gate would immediately replace back into `/permissions` — an infinite loop. The ref remembers "we've already shown the gate this app session" the moment the pathname becomes `/permissions`, and the redirect/overlay conditions both check it. It intentionally does NOT persist across app restarts (no `SecureStorePort` write) — that is what makes "skip → shown again next launch" the naturally emerging behavior the design calls for, without a second stored key.

- [ ] **Step 1: Import `location`**

`src/app/_layout.tsx:10` currently reads:

```tsx
import { notifications, type NotificationTapData } from '@/adapters';
```

Change to:

```tsx
import { location, notifications, type NotificationTapData } from '@/adapters';
```

- [ ] **Step 2: Add gate state, right after the existing `status`/`onAuthRoute`/`signedIn` derivations**

In `RootLayout`, immediately after this existing block (around `_layout.tsx:148-154`):

```tsx
  const status = useAuth((state) => state.status);
  const restore = useAuth((state) => state.restore);
  const pathname = usePathname();

  const onAuthRoute = AUTH_ROUTES.has(pathname);
  const signedIn = status === 'signed-in';
```

add:

```tsx

  const [needsPermissions, setNeedsPermissions] = useState<boolean | null>(null);
  const visitedPermissionsRef = useRef(false);
```

- [ ] **Step 3: Track whether `/permissions` has been visited this session**

Add this effect anywhere among the other `useEffect` calls in `RootLayout`, before the gate effect from Step 5 below (ordering matters — see the task description):

```tsx
  useEffect(() => {
    if (pathname === '/permissions') visitedPermissionsRef.current = true;
  }, [pathname]);
```

- [ ] **Step 4: Replace the bare `useNotificationTapRouting(signedIn);` call and add the permission-check effect**

`src/app/_layout.tsx:177` (after Task 1's Step 3) reads:

```tsx
  const hasInitialTap = useNotificationTapRouting(signedIn);
```

Immediately after that line, add:

```tsx

  useEffect(() => {
    if (!signedIn) {
      setNeedsPermissions(null);
      visitedPermissionsRef.current = false;
      return;
    }
    if (hasInitialTap === null) return;
    if (hasInitialTap) {
      setNeedsPermissions(false);
      return;
    }

    let cancelled = false;
    void Promise.all([location.getPermission(), notifications.getPermission()]).then(
      ([locationResult, notificationResult]) => {
        if (cancelled) return;
        const locationPrompt = locationResult.ok && locationResult.value.foreground === 'prompt';
        const notificationPrompt =
          notificationResult.ok && notificationResult.value === 'prompt';
        setNeedsPermissions(locationPrompt || notificationPrompt);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [signedIn, hasInitialTap]);
```

- [ ] **Step 5: Extend the gate effect with the fourth branch**

`src/app/_layout.tsx:166-175` currently reads:

```tsx
  // The gate. Imperative rather than <Redirect>, which needs a focused route
  // and cannot run from a layout; the navigator stays mounted throughout.
  useEffect(() => {
    if (status === 'restoring') return;
    if (status === 'signed-out' && !onAuthRoute) {
      router.replace('/onboarding');
      return;
    }
    if (status === 'signed-in' && onAuthRoute) router.replace('/');
  }, [status, onAuthRoute]);
```

Replace it with:

```tsx
  // The gate. Imperative rather than <Redirect>, which needs a focused route
  // and cannot run from a layout; the navigator stays mounted throughout.
  useEffect(() => {
    if (status === 'restoring') return;
    if (status === 'signed-out' && !onAuthRoute) {
      router.replace('/onboarding');
      return;
    }
    if (status === 'signed-in' && onAuthRoute) {
      router.replace('/');
      return;
    }
    // Fourth branch: a signed-in user with an undetermined location or
    // notification permission and no cold-start notification tap in flight
    // (`hasInitialTap`, checked upstream via `needsPermissions`) gets routed
    // through /permissions once per app session. `visitedPermissionsRef`
    // stops this from firing again the moment "시작하기" replaces back to
    // home — see the effect above for why there is deliberately no stored
    // key making this permanent across restarts.
    if (
      status === 'signed-in' &&
      needsPermissions === true &&
      !visitedPermissionsRef.current &&
      pathname !== '/permissions'
    ) {
      router.replace('/permissions');
    }
  }, [status, onAuthRoute, needsPermissions, pathname]);
```

- [ ] **Step 6: Widen the flash-guard overlay**

`src/app/_layout.tsx:227-229` (original line numbers; shifted by the insertions above) currently reads:

```tsx
      {status === 'restoring' || (status === 'signed-out' && !onAuthRoute) ? (
        <View style={StyleSheet.absoluteFill} className="bg-parchment" pointerEvents="none" />
      ) : null}
```

Replace with:

```tsx
      {status === 'restoring' ||
      (status === 'signed-out' && !onAuthRoute) ||
      (status === 'signed-in' && needsPermissions === null) ||
      (status === 'signed-in' &&
        needsPermissions === true &&
        !visitedPermissionsRef.current &&
        pathname !== '/permissions') ? (
        <View style={StyleSheet.absoluteFill} className="bg-parchment" pointerEvents="none" />
      ) : null}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. `/permissions` now resolves as a typed route (Task 2 created the file), so the string literals above must typecheck with no `as any` needed.

- [ ] **Step 8: Manual end-to-end check (web)**

Run: `npm run web`. Since both adapters report `unavailable` on web, `needsPermissions` should resolve to `false` immediately after sign-in and the gate should be invisible on web — this is the critical regression check, because a bug here breaks the web delivery entirely (`AGENTS.md`: "breaking web to fix iOS is never an acceptable trade").

- Sign out if currently signed in, then sign back in (or reload with a stored token to exercise `restore()`).
- Expected: lands on home directly, no visible `/permissions` detour, no flash of the wrong screen, no console errors.

This is the only verification Task 3 can get on web — the `prompt`-triggered redirect itself needs a real device with location/notification permission still undetermined, which is Task 4's job.

- [ ] **Step 9: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: 로그인 후 위치·알림 권한 확인 게이트 연결"
```

---

### Task 4: Full verification loop

**Files:** none (verification only).

**Interfaces:** none — this task runs the project's existing gate sequence from `AGENTS.md` end to end and records the output.

- [ ] **Step 1: Gate 1 — types**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Gate 2 — web renders**

Run: `npm run web`. Confirm the browser console is empty (no "Cannot find native module" — that would mean a native adapter leaked into a screen).

- [ ] **Step 3: Gate 3 — web export**

Run: `npm run export:web`
Expected: exit 0, writes `dist/index.html` and `dist/_expo/static/js/web/*.js`.

- [ ] **Step 4: Gate 4 — no native code in the web bundle**

Run: `npm run verify:web`
Expected: exit 0. This both exports and greps the bundle — it should report the same positive/negative controls it already reports today (e.g. `HealthKit is only available on iOS.` present, `expo-location`/`expo-notifications` native-only specifiers absent) since this feature added no new native-only import to any screen — `permissions.tsx` only imports the same adapters `settings/permissions.tsx` already imports successfully today.

- [ ] **Step 5: Gate 5 — device (manual, requires a physical iPhone)**

This step cannot be completed by an agent without hardware access — hand off to whoever has the paired iPhone (team `X4RZSKR6X3`).

```bash
npm run prebuild
npm run ios:clean
```

Then, **critically, delete the app from the test iPhone first** — iOS shows the location/notification prompts once per install, so testing the `prompt` branch on an already-answered install will silently skip the screen (a false "it doesn't show up" report).

**The Keychain survives deletion — plain reinstall is not enough.** This app persists three keys via `expo-secure-store` (the iOS Keychain), which is untouched by deleting the app: `mowa.auth.token.v1`, `mowa.detection.enabled.v1`, `mowa.notification.enabled.v1` (`src/adapters/types.ts` `SECURE_KEYS`). Before each fresh-install run below, from the currently-installed build: (1) if signed in, sign out from 설정 first — this clears the auth token, so the reinstalled app actually lands on `/login` rather than a restored session; (2) if 자동 감지 사용 (설정 > 자동 감지 설정) is on, turn it off first — this persists `detectionEnabled=false`, which matters because `RootLayout` calls `useDetection.getState().load()` on every sign-in (a pre-existing effect, unrelated to this feature), and if that reconcile finds a stale `detectionEnabled=true` it calls `walkDetector.start()`, which raises iOS's own location "Always" prompt on top of `/permissions` before the user has tapped anything. Skipping this reset produces a confusing but non-corrupting demo (`/permissions` still self-heals its rows), not silent test corruption — but it means "the prompt appeared on its own" and "the gate worked as designed" become impossible to tell apart in a report. Record which of these two resets was actually done for each numbered scenario below, in the PR's `## 확인 사항`.

Steps to actually exercise:

1. Fresh install → sign in → confirm `/permissions` appears (both rows show 미설정/prompt state with buttons).
2. Tap "허용" on 위치 → confirm the iOS system prompt appears, and after answering, the row updates to 앱 사용 중만 허용됨 with an "Always로 변경" button.
3. Tap "Always로 변경" → confirm the second iOS prompt (or its deferred system timing) and that the row updates to 항상 허용됨 once granted.
4. Tap "허용" on 알림 → confirm the iOS prompt, row updates to 허용됨.
5. Tap "시작하기" → confirm landing on home, no loop back to `/permissions`.
6. Relaunch the app (still signed in, token restored) → confirm `/permissions` does **not** reappear (both permissions left `prompt`).
7. **Skip path** (separate fresh install): sign in, immediately tap "시작하기" without touching any row → confirm home is reached, then force-quit and relaunch → confirm `/permissions` reappears (this is the intended behavior per the design's explicit call-out, not a bug).
8. **Denied path** (separate fresh install): deny 위치 when prompted → confirm the row shows 거부됨 with a "기기 설정 열기" button, and that tapping it opens the Settings app.
9. **Notification-tap race**: with the app fully signed out, trigger a walk detection notification (or use `/debug`'s test-event affordance if available), force-quit, tap the notification to cold-start the app, sign in on the resulting `/login` screen → confirm the app lands on `/walk` (the suggestion flow), not `/permissions`, even though permissions are still `prompt`.

Log every result — pass or fail — in the PR's `## 확인 사항` section, per `AGENTS.md`'s Git/PR convention.

- [ ] **Step 6: Re-check the push entitlement**

`npm run prebuild` was run in Step 5. Confirm the strip-aps step still worked:

```bash
grep -c aps-environment ios/*/*.entitlements
```

Expected: `0`. (This feature adds no push capability, but any `prebuild` run must be re-verified per `AGENTS.md`'s Known Traps section.)

---

## Self-Review Notes

- **Spec coverage:** every confirmed decision in the memory doc (`login-permission-gate-plan.md`) maps to a task — location+notifications only (Task 2's row set), skippable (Task 2's 시작하기), denied-state auto-pass (Task 3's `needsPermissions` only checks `prompt`, never `denied`), per-permission buttons/A안 (Task 2), no storage key (Task 3's effect never touches `SecureStorePort`), the four pitfalls (notification-tap race → Task 1+3's `hasInitialTap`; denied-is-not-`ok:false` → Task 2's `describeLocation`/switch read `.value` not `.ok`; web flash → Task 3 Step 6; `signed-in` ≠ `user !== null` → gate only ever reads `status`, never `user`), and the "team confirmation needed" flag (carried into this doc's Task 3 note and repeated here for the PR body).
- **Judgment call flagged for the team:** the gate's location condition uses `foreground === 'prompt'` only, deliberately excluding `background`. Call this out explicitly in the PR description.
- **Type consistency:** `useNotificationTapRouting`'s new return type (`boolean | null`) is used identically in Task 3 (`hasInitialTap === null` / `if (hasInitialTap)`). `LocationRowState` (Task 2) and the gate's own `locationResult.value.foreground === 'prompt'` check (Task 3) both read the same `LocationPermission` shape from `src/adapters/types.ts:120-123` — no drift.
- **No placeholders:** every step above has literal, complete code — no "add error handling" stubs.

---

## PR

Per `AGENTS.md`: title `[Feat] 로그인 후 위치·알림 권한 확인 게이트`, body template `## 작업 내용` / `## 확인 사항` (paste Task 4's gate output here), scoped to this one feature only. Delete the branch after merge and re-sync `main` before starting the next branch.
