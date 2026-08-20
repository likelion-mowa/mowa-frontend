import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// NativeWind entry. Imported exactly once, here.
import '../../global.css';

import { location, notifications, walkDetector, type NotificationTapData } from '@/adapters';
import { setApiLogHandler } from '@/api/client';
import { useAuth } from '@/stores/auth-store';
import { useDetection } from '@/stores/detection-store';
import { useDiagnostics } from '@/stores/diagnostics-store';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * Held until the session has been restored, so the app never paints home for a
 * frame before deciding the user is signed out. On web every SplashScreen call
 * is a verified no-op, which is why the overlay below exists as well.
 */
void SplashScreen.preventAutoHideAsync();

/** Routes a signed-out user is allowed to be on. */
const AUTH_ROUTES = new Set(['/onboarding', '/login']);

/**
 * Paths a walk notification may carry. `/walk` is what the Core writes today;
 * `/` comes from notifications posted by an older build, because the path is
 * persisted in UserDefaults and only rewritten when detection is started
 * again. Anything else is not ours to route.
 */
const WALK_TAP_PATHS = new Set(['/walk', '/']);

// Module scope so it survives a Fast Refresh remount: a cold-start tap is
// delivered twice (the initial response is also replayed to the listener), and
// re-navigating would restart the suggestion flow mid-choice.
let lastHandledIssuedAtMs: number | null = null;

function routeNotificationTap(data: NotificationTapData): void {
  if (data.issuedAtMs !== null && data.issuedAtMs === lastHandledIssuedAtMs) return;
  if (data.path === null || !WALK_TAP_PATHS.has(data.path)) {
    console.log(`[MOWA] notif tap ignored path=${String(data.path)}`);
    return;
  }
  lastHandledIssuedAtMs = data.issuedAtMs;

  // The walk this tap is about sits next to the NOTIFICATION, not next to the
  // tap: a cold-start tap is routed only after the session restores, and one
  // received while signed out is held until sign-in. openSuggestion anchors its
  // history window here. Passed verbatim — a payload with no issuedAtMs must
  // clear an older anchor rather than let it be inherited.
  useWalkCandidateFlow.getState().noteNotificationTap(data.issuedAtMs);

  const navigate = () => router.navigate('/walk');
  try {
    navigate();
  } catch {
    // The only expected throw is the root navigator not being mounted yet on a
    // cold start. One deferred retry, then the failure is logged rather than
    // swallowed.
    setTimeout(() => {
      try {
        navigate();
      } catch (error) {
        console.log(`[MOWA] notif tap navigation FAILED — ${String(error)}`);
      }
    }, 0);
  }
}

/**
 * Notification taps, both directions:
 * - cold start: the tap that launched the app, which a listener alone never
 *   sees (measured in the prior repo);
 * - warm: the response listener, for taps while the app is already running.
 *
 * The foreground handler is what makes a notification visible at all while the
 * app is open — without it iOS delivers it silently. All three calls are
 * no-ops on web.
 *
 * Everything except the foreground handler waits for a session. That is not
 * just a guard: `getInitialResponse()` CONSUMES the stored tap, so not calling
 * it while signed out is what preserves it. The tap is then routed the moment
 * the user signs in, landing them on the suggestion screen instead of losing it.
 */
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

/**
 * Fades each new route in — web only.
 *
 * The web build has no screen transition at all. react-native-screens ships
 * `const ScreenStack = View` for web (components/ScreenStack.web.js) and its
 * `Screen.web.js` only toggles `display: flex | none`, so the `animation`
 * options on the Stack.Screens below are silently dropped and routes swap
 * between two frames. Measured 2026-08-15: through a home → archive navigation
 * not one element in the tree carried a transform.
 *
 * This does not bring the native slide back — that needs the library to
 * implement a real stack on web. It removes the jump cut, which is what the
 * missing transition actually costs the reviewer.
 *
 * Native is deliberately untouched: it already runs the real transition, and
 * layering this on top would play two animations for one navigation.
 */
function RouteTransition({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const opacity = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Restart from the hidden state on every path change; the outgoing screen is
    // already gone by then, so there is nothing to fade out against.
    opacity.setValue(0);
    lift.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [pathname, opacity, lift]);

  // Hooks above stay unconditional; only the output branches.
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY: lift }] }}>
      {children}
    </Animated.View>
  );
}

export default function RootLayout() {
  const status = useAuth((state) => state.status);
  const restore = useAuth((state) => state.restore);
  const pathname = usePathname();

  const onAuthRoute = AUTH_ROUTES.has(pathname);
  const signedIn = status === 'signed-in';

  const [needsPermissions, setNeedsPermissions] = useState<boolean | null>(null);
  const visitedPermissionsRef = useRef(false);
  // Keeps the detection reconcile to once per signed-in session: its effect
  // below depends on `pathname`, so without this it would re-run on every
  // navigation.
  const detectionLoadedRef = useRef(false);

  // reactCompiler is on: every hook here stays unconditional, so RootLayout
  // never returns early.
  useEffect(() => {
    // Registered before restore() fires the first request (getMe), so no
    // request in the app's lifetime is missed. /debug renders this log — the
    // only way to see an HTTP exchange on a device with no reachable proxy.
    setApiLogHandler((line) => useDiagnostics.getState().append(line));
    void restore();
  }, [restore]);

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

  // Tracks whether /permissions has been visited this session — see
  // visitedPermissionsRef below the gate effect for what this guards against.
  useEffect(() => {
    if (pathname === '/permissions') visitedPermissionsRef.current = true;
  }, [pathname]);

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
    // home — see the effect below for why there is deliberately no stored
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

  const hasInitialTap = useNotificationTapRouting(signedIn);

  // The visitedPermissionsRef guard: pressing "시작하기" (skip) on /permissions
  // calls router.replace('/'), which lands back on a route where, without this
  // guard, needsPermissions would still read true and the gate effect above
  // would immediately replace back into /permissions — an infinite loop. The
  // ref intentionally does NOT persist across app restarts (no SecureStorePort
  // write); OS permission state itself is the memory, so "skip → shown again
  // next launch" is the naturally emerging behavior.
  useEffect(() => {
    if (!signedIn) {
      setNeedsPermissions(null);
      visitedPermissionsRef.current = false;
      detectionLoadedRef.current = false;
      return;
    }
    if (hasInitialTap === null) return;
    if (hasInitialTap) {
      setNeedsPermissions(false);
      return;
    }

    let cancelled = false;
    void Promise.all([
      location.getPermission(),
      // Motion counts here too. Without it a user who granted location and
      // notifications never reaches /permissions again, so the 동작 및 피트니스
      // row could not be shown and the CoreMotion dialog would keep arriving
      // unannounced from the home screen's detection toggle. getDiagnostics
      // reads the status without prompting.
      walkDetector.getDiagnostics(),
      notifications.getPermission(),
    ])
      .then(([locationResult, motionResult, notificationResult]) => {
        if (cancelled) return;
        const locationPrompt = locationResult.ok && locationResult.value.foreground === 'prompt';
        const motionPrompt =
          motionResult.ok && motionResult.value.motionAuthorization === 'prompt';
        const notificationPrompt = notificationResult.ok && notificationResult.value === 'prompt';
        setNeedsPermissions(locationPrompt || motionPrompt || notificationPrompt);
      })
      .catch((error: unknown) => {
        // No adapter is meant to throw, but a rejection would leave
        // needsPermissions null forever — which parks the app under the opaque
        // overlay below AND now also never reconciles detection, since that
        // effect waits on this one. Undecidable means let them through.
        if (cancelled) return;
        console.log(`[MOWA] permission gate read FAILED — ${String(error)}`);
        setNeedsPermissions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, hasInitialTap]);

  // The detect → candidate flow runs app-wide but is useless without a session:
  // a detection with no token cannot become a server candidate. On web the
  // subscription is a no-op by design. It raises no permission prompt, so it
  // does not wait for the gate below.
  useEffect(() => {
    if (!signedIn) return;
    return useWalkCandidateFlow.getState().startCandidateFlow();
  }, [signedIn]);

  /**
   * Reconciles the stored detection preference against what the detector is
   * actually doing — once per signed-in session, and only after the permission
   * gate is out of the way.
   *
   * Split out of the effect above and delayed on purpose. `load()` ends in
   * `walkDetector.start()` whenever the stored preference is on, and `start()`
   * raises the Motion, Always-location and HealthKit dialogs itself. Running it
   * on sign-in put those on screen on top of /permissions step 1, before the
   * user had pressed 확인 on anything — measured on a device. The Keychain
   * survives app deletion, so a reinstall still carries detectionEnabled=true
   * and reproduces it; that is why it looked intermittent.
   *
   * "Out of the way" is either branch: the gate decided not to run
   * (`needsPermissions === false`), or it ran and the user has left it.
   */
  useEffect(() => {
    if (!signedIn) return;
    if (detectionLoadedRef.current) return;
    const gateSettled =
      needsPermissions === false ||
      (visitedPermissionsRef.current && pathname !== '/permissions');
    if (!gateSettled) return;
    detectionLoadedRef.current = true;
    void useDetection.getState().load();
  }, [signedIn, needsPermissions, pathname]);

  return (
    <>
      <StatusBar style="auto" />
      {/*
        Wraps only the navigator. The overlay below must not fade with the
        route — it is what hides the flash while the session restores.
      */}
      <RouteTransition>
        <Stack screenOptions={{ headerShown: false }}>
          {/*
            Home's glass bar pushes into the archive (forward: slide from
            right, the native-stack default for `router.push`). Every existing
            `router.replace('/')` / `<Redirect href="/">` in the app — the
            archive's "홈으로" button, the diary flow's abort guards, its own
            "홈으로 돌아가기" — is a "leave and go back" action, never a forward
            one, so replacing INTO home should animate as a pop (reverse
            slide) instead of native-stack's default replace animation, which
            mimics another forward push.

            These options are iOS-only in practice — see RouteTransition above
            for why web drops them.
          */}
          <Stack.Screen name="index" options={{ animationTypeForReplace: 'pop' }} />
          <Stack.Screen name="archive" options={{ animation: 'slide_from_right' }} />
          {/* 로그아웃 replaces into onboarding, and that is a leave, not a push. */}
          <Stack.Screen name="onboarding" options={{ animationTypeForReplace: 'pop' }} />
        </Stack>
      </RouteTransition>

      {/*
        What actually prevents the flash. It covers the restore window and the
        frame between "signed out" and the replace landing on /onboarding — on
        iOS it backs up the splash, and on web it is the only defence, since
        expo-splash-screen's web build is a no-op.
      */}
      {status === 'restoring' ||
      (status === 'signed-out' && !onAuthRoute) ||
      (status === 'signed-in' && needsPermissions === null) ||
      (status === 'signed-in' &&
        needsPermissions === true &&
        !visitedPermissionsRef.current &&
        pathname !== '/permissions') ? (
        <View style={StyleSheet.absoluteFill} className="bg-parchment" pointerEvents="none" />
      ) : null}
    </>
  );
}
