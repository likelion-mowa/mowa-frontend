import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// NativeWind entry. Imported exactly once, here.
import '../../global.css';

import { notifications, type NotificationTapData } from '@/adapters';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

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
 */
function useNotificationTapRouting(): void {
  useEffect(() => {
    notifications.setForegroundHandler();

    void notifications.getInitialResponse().then((result) => {
      if (!result.ok) {
        console.log(`[MOWA] notif initial response FAILED — ${result.error}`);
        return;
      }
      if (result.value !== null) routeNotificationTap(result.value);
    });

    return notifications.addResponseListener(routeNotificationTap);
  }, []);
}

export default function RootLayout() {
  // The detect → candidate flow runs app-wide, independent of which screen is
  // mounted. On web the detector subscription is a no-op by design.
  useEffect(() => useWalkCandidateFlow.getState().startCandidateFlow(), []);
  useNotificationTapRouting();

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
