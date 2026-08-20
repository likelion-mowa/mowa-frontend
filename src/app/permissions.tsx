import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import {
  health,
  location,
  notifications,
  toPermissionState,
  walkDetector,
  type PermissionState,
} from '@/adapters';
import { PrimaryButton } from '@/components/buttons';
import { CharacterFigure } from '@/components/character-hero';
import { StepDots } from '@/components/step-dots';

/**
 * Login → home permission gate (new — no prototype screen to match).
 *
 * One full screen per permission: why it is needed, then which button to press
 * in the OS dialog that "확인" raises. The previous version listed all three as
 * rows with a small 허용 pill each, and a row's 12px subtitle was the whole
 * explanation — read by nobody before a dialog that iOS only ever shows ONCE
 * per install.
 *
 * Reachable only via `router.replace('/permissions')` from the root layout's
 * gate. No back button (nothing to pop to) and, deliberately, no skip: every
 * step ends in a decision, so nothing is left at `prompt` and the gate does not
 * come back next launch. The user declines in the OS dialog, not here.
 *
 * ONE route rather than four. `/permissions` is a replace target, so four
 * routes would build a back stack that leads to screens whose prompt is already
 * spent — and the layout's gate, its flash overlay and `visitedPermissionsRef`
 * all compare against this exact pathname. `/diary/context` runs its three
 * steps the same way.
 *
 * Copy below is new (the prototype has no such screen) — drafted here and
 * flagged for the team's copy review, same as `login.tsx`.
 *
 * The bracketed words in each instruction are the LITERAL button labels of the
 * dialog that 확인 raises, and they differ per permission: the location alert
 * offers 앱을 사용하는 동안 허용 (there is no plain 허용 on it), the Always
 * upgrade offers 항상 허용으로 변경, 동작 및 피트니스 offers 허용, and HealthKit
 * is a sheet with a switch per type and 허용 in the top-right.
 *
 * 동작 및 피트니스 was checked on a device (2026-08-20) and corrected — it had
 * been written as 확인 from the documented wording, which was wrong. The other
 * three still come from that wording; check each one on the device too.
 */

type StepKey = 'location-foreground' | 'location-always' | 'motion' | 'health' | 'notification';

const COPY: Record<StepKey, { headline: string; instruction: string }> = {
  'location-foreground': {
    headline: '산책한 장소를 기록하려면\n[위치] 권한이 필요해요.',
    instruction: '다음 화면에서 [앱을 사용하는 동안 허용]을\n눌러주세요.',
  },
  'location-always': {
    headline: '앱을 닫아도 산책을 감지하려면\n[위치] 권한이 항상 허용이어야 해요.',
    instruction: '다음 화면에서 [항상 허용으로 변경]을\n눌러주세요.',
  },
  motion: {
    headline: '걸음 수로 산책이 끝난 걸 알아채려면\n[동작 및 피트니스] 권한이 필요해요.',
    instruction: '다음 화면에서 [허용]을\n눌러주세요.',
  },
  health: {
    headline: '산책 중 걸음 수를 읽으려면\n[건강] 앱 접근 권한이 필요해요.',
    // Not the two-button alert the others use: HealthKit shows a full-screen
    // sheet listing each requested type with its own switch plus a 모두 켜기
    // shortcut, and 허용 sits in the top-right rather than at the bottom. Both
    // routes to the same grant are named because the sheet gives no hint that
    // the per-type switch is the thing that matters.
    instruction:
      '다음 화면에서 [걸음 수]를 켜거나\n[모두 켜기]를 누르고\n오른쪽 위 [허용]을 눌러주세요.',
  },
  notification: {
    headline: '산책이 끝나면 기록을 제안해 드리려면\n[알림] 권한이 필요해요.',
    instruction: '다음 화면에서 [허용]을\n눌러주세요.',
  },
};

/**
 * Replaces the Always step's instruction once location has been refused:
 * `requestBackgroundPermission` returns `ok:false` without showing anything in
 * that state (location.native.ts), so promising a dialog would be a lie.
 */
const ALWAYS_BLOCKED_INSTRUCTION =
  '위치를 허용하지 않아 지금은 바꿀 수 없어요.\n나중에 설정 > 권한 관리에서 바꿀 수 있어요.';

/**
 * Advance anyway if a request never settles — with no skip button, a request
 * that never calls back would strand the user (the plausible one is
 * requestMotionPermission, which waits on a native CoreMotion query).
 *
 * Two minutes, not seconds: the promise only settles once the person answers
 * the iOS dialog, so a short timeout would fire while they are still reading it
 * and advance the screen behind the dialog.
 */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * A step is worth showing only while its dialog can still appear. `unavailable`
 * counts too, and that is what keeps the screen reviewable on the web build:
 * every web adapter reports `unavailable`, so opening /permissions in a browser
 * walks all four steps with the requests as no-ops. On a device `unavailable`
 * means the hardware isn't there (the simulator has no motion coprocessor), and
 * a no-op step is the honest outcome there as well.
 */
function promptable(state: PermissionState): boolean {
  return state === 'prompt' || state === 'unavailable';
}

async function readPlan(): Promise<{ steps: StepKey[]; foreground: PermissionState }> {
  const [locationResult, motionResult, notificationResult] = await Promise.all([
    location.getPermission(),
    // Reads the status without prompting — issuing a CoreMotion query is itself
    // the prompt, so this must not be the request path.
    walkDetector.getDiagnostics(),
    notifications.getPermission(),
  ]);

  const foreground: PermissionState = locationResult.ok
    ? locationResult.value.foreground
    : 'unknown';
  const background: PermissionState = locationResult.ok
    ? locationResult.value.background
    : 'unknown';
  const motion: PermissionState = motionResult.ok
    ? toPermissionState(motionResult.value.motionAuthorization)
    : 'unknown';
  const notification: PermissionState = notificationResult.ok
    ? notificationResult.value
    : 'unknown';

  const steps: StepKey[] = [];
  if (promptable(foreground)) {
    steps.push('location-foreground');
    // Only ever right after When In Use is decided, which is when iOS actually
    // raises the upgrade dialog. `background` stays undetermined forever for a
    // user who answered "Keep While Using", so keying on it alone would show a
    // screen with no dialog behind it on every later launch.
    if (background !== 'granted') steps.push('location-always');
  }
  if (promptable(motion)) {
    steps.push('motion');
    // HealthKit rides on the motion step rather than on a state read of its
    // own. Apple never discloses READ authorization — it reports notDetermined
    // forever, even after a grant (health.native.ts) — so "have we asked yet"
    // cannot be recovered from the OS, and a stored flag would be wrong in the
    // one case that matters: the Keychain survives app deletion while HealthKit
    // authorization does not, so a reinstall would skip the screen and let the
    // sheet arrive unannounced. Motion is a sound proxy: the only thing that
    // asks for HealthKit is walkDetector.start(), which asks for Motion in the
    // same call, so a motion permission still at `prompt` means HealthKit has
    // not been asked either.
    steps.push('health');
  }
  if (promptable(notification)) steps.push('notification');

  return { steps, foreground };
}

/**
 * The instruction paragraph, set heavier than the headline's supporting text
 * would normally be. It is the line that has to survive being skimmed: the
 * headline says why the permission is wanted, this one says which button to
 * press on the screen that replaces it, and only the second is still useful
 * once the OS dialog is up. The bracketed button label is lifted out in sage so
 * the eye lands on the exact word the dialog shows.
 */
function Instruction({ text }: { text: string }) {
  return (
    <Text className="mt-7 text-[19px] font-semibold leading-relaxed text-ink">
      {text.split(/(\[[^\]]*\])/).map((part, index) =>
        part.startsWith('[') ? (
          <Text key={index} className="font-extrabold text-sage-dark">
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export default function PermissionsScreen() {
  const [plan, setPlan] = useState<StepKey[] | null>(null);
  const [index, setIndex] = useState(0);
  const [foreground, setForeground] = useState<PermissionState>('prompt');
  const [busy, setBusy] = useState(false);

  // Built once. The denominator must not move while the user is walking
  // through it, so nothing re-reads the plan afterwards.
  useEffect(() => {
    let cancelled = false;
    void readPlan().then((result) => {
      if (cancelled) return;
      setForeground(result.foreground);
      setPlan(result.steps);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Forward-only slide, matching /diary/context's rail. There is no back.
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const previousIndex = useRef(index);
  useEffect(() => {
    if (previousIndex.current === index) return;
    previousIndex.current = index;
    slideX.setValue(32);
    slideOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(slideX, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(slideOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [index, slideX, slideOpacity]);

  const step = plan !== null && index < plan.length ? plan[index] : null;
  const isLast = plan !== null && index >= plan.length - 1;

  // Denied, not merely "not granted": on web every state reads `unavailable`,
  // and blocking there would hide this step from the design review.
  const alwaysBlocked = step === 'location-always' && foreground === 'denied';

  const advance = () => {
    if (isLast) {
      router.replace('/');
      return;
    }
    setBusy(false);
    setIndex((current) => current + 1);
  };

  /**
   * Grant and denial both move on. A request re-issued on an install that has
   * already answered resolves `{ok: true, value: 'denied'}` with no dialog, so
   * neither `ok` nor the value can decide navigation here.
   */
  const runRequest = (request: () => Promise<unknown>) => {
    setBusy(true);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      advance();
    };
    const timer = setTimeout(finish, REQUEST_TIMEOUT_MS);
    void request().then(finish, finish);
  };

  const handleConfirm = () => {
    if (step === null) return;
    if (alwaysBlocked) {
      advance();
      return;
    }
    switch (step) {
      case 'location-foreground':
        runRequest(() =>
          location.requestForegroundPermission().then((result) => {
            // Decides whether the next step can raise its dialog at all.
            if (result.ok) setForeground(result.value.foreground);
          }),
        );
        return;
      case 'location-always':
        runRequest(() => location.requestBackgroundPermission());
        return;
      case 'motion':
        runRequest(() => walkDetector.requestMotionPermission());
        return;
      case 'health':
        runRequest(() => health.requestAuthorization());
        return;
      case 'notification':
        runRequest(() => notifications.requestPermission());
        return;
    }
  };

  if (plan === null) {
    // Same colour as the layout's flash overlay, so the read is invisible
    // rather than a white frame between two painted ones.
    return <View className="flex-1 bg-parchment" />;
  }
  if (step === null) {
    // Nothing left to ask — reachable by opening the route directly.
    return <Redirect href="/" />;
  }

  const copy = COPY[step];
  const stepNumber = index + 1;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-center px-5 py-3">
        <StepDots total={plan.length} current={stepNumber} />
        <View className="absolute right-5">
          <Text className="text-[11px] font-medium text-ink-subtle">
            {stepNumber} / {plan.length}
          </Text>
        </View>
      </View>

      {/*
        Centred rather than top-anchored: the copy is two short paragraphs, so
        pinning it under the character leaves a hole above the CTA on a tall
        phone. Same shape as /diary/done. The text gutter matches the CTA's
        px-6 so the first character sits on the button's left edge.

        The ScrollView never scrolls at these sizes — `flexGrow` makes it a
        centring container. It is here so the smallest screen (SE, where a
        three-line headline leaves ~40px of slack) scrolls instead of clipping
        the character off the top, which is what centring alone would do.
      */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{ transform: [{ translateX: slideX }], opacity: slideOpacity }}>
          <View className="items-center">
            <CharacterFigure width={210} />
          </View>

          <View className="mt-9 px-6">
            <Text className="text-[22px] font-bold leading-snug text-ink">{copy.headline}</Text>
            <Instruction text={alwaysBlocked ? ALWAYS_BLOCKED_INSTRUCTION : copy.instruction} />
          </View>
        </Animated.View>
      </ScrollView>

      <View className="px-6" style={{ marginBottom: 24 }}>
        <PrimaryButton hero glow label="확인" onPress={handleConfirm} disabled={busy} />
      </View>
    </SafeAreaView>
  );
}
