import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// NativeWind entry. Imported exactly once, here.
import '../../global.css';

import { notifications, type NotificationTapData } from '@/adapters';
import { useAuth } from '@/stores/auth-store';
import { useDetection } from '@/stores/detection-store';
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
function useNotificationTapRouting(signedIn: boolean): void {
  useEffect(() => {
    notifications.setForegroundHandler();
  }, []);

  useEffect(() => {
    if (!signedIn) return;

    void notifications.getInitialResponse().then((result) => {
      if (!result.ok) {
        console.log(`[MOWA] notif initial response FAILED — ${result.error}`);
        return;
      }
      if (result.value !== null) routeNotificationTap(result.value);
    });

    return notifications.addResponseListener(routeNotificationTap);
  }, [signedIn]);
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

  // reactCompiler is on: every hook here stays unconditional, so RootLayout
  // never returns early.
  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

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

  useNotificationTapRouting(signedIn);

  // The detect → candidate flow runs app-wide but is useless without a session:
  // a detection with no token cannot become a server candidate. On web the
  // subscription is a no-op by design.
  useEffect(() => {
    if (!signedIn) return;
    const unsubscribe = useWalkCandidateFlow.getState().startCandidateFlow();
    // Reconciles the stored detection preference against what the detector is
    // actually doing. Here because this is the only place that knows the app
    // just booted, and it must not run before there is a session.
    void useDetection.getState().load();
    return unsubscribe;
  }, [signedIn]);

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
      {status === 'restoring' || (status === 'signed-out' && !onAuthRoute) ? (
        <View style={StyleSheet.absoluteFill} className="bg-parchment" pointerEvents="none" />
      ) : null}
    </>
  );
}
