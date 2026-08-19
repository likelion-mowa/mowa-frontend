import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shadows } from '@/lib/theme';

/**
 * The AI wait body (prototype AILoadingScreen), shared by the two places the
 * server keeps the user waiting on an OpenAI round trip: /diary/generating,
 * where the draft is written, and the 수정 overlay on
 * /experiences/[experienceId], where PATCH regenerates the title and body
 * server-side (see api/client.ts's updateWalkExperience).
 *
 * The prototype's pulse-ring / bounce-in / shimmer are CSS keyframes; here
 * they are RN core Animated loops (NativeWind's animate-* classes are
 * unverified on this stack, Animated is not).
 *
 * The three helpers below stay in this file rather than lib/animations.ts:
 * that module holds micro-interactions reused across the app (usePressScale,
 * useAnimatedToggle), while these exist only to draw this one body.
 *
 * Paints no background of its own — the caller does, which is what lets the
 * same body sit inside a route's SafeAreaView and inside an absolute-fill
 * overlay without either one restyling it.
 */

/** Prototype `bounce-in`: overshoot spring from 0.7 to 1. */
function useBounceIn() {
  const scale = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scale]);
  return scale;
}

/** Prototype `pulse-ring`: a ring scaling 0.92 → 1.18 while fading out, looped. */
function PulseRing({ delayMs = 0 }: { delayMs?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(progress, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, delayMs]);

  // Animated values live on the Animated.View's style; className styling stays
  // on a plain inner View (className-on-Animated is unverified on this stack).
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.18] }) },
        ],
        opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0, 0] }),
      }}>
      <View className="h-full w-full rounded-full border-2 border-sage/40" />
    </Animated.View>
  );
}

/** Prototype `shimmer`, simplified to an opacity breath on the placeholder bars. */
function ShimmerBars() {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <Animated.View
      style={{
        alignSelf: 'stretch',
        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      }}>
      <View className="mt-6 w-full">
        <View className="h-5 w-3/4 rounded-lg bg-parchment-dark" />
        <View className="mt-3 h-3.5 w-full rounded-lg bg-parchment-dark" />
        <View className="mt-3 h-3.5 w-5/6 rounded-lg bg-parchment-dark" />
        <View className="mt-3 h-3.5 w-4/5 rounded-lg bg-parchment-dark" />
      </View>
    </Animated.View>
  );
}

export function AiLoading() {
  const pop = useBounceIn();
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="items-center">
        <View style={shadows.badgeGlow} className="rounded-full bg-sage px-3 py-1.5">
          <Text className="text-xs font-semibold text-white">잠깐만요! ✨</Text>
        </View>
        <View className="mt-4 h-24 w-24">
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <View className="h-24 w-24 items-center justify-center rounded-full bg-sage-pale">
              <Text className="text-5xl">🌿</Text>
            </View>
          </Animated.View>
          <PulseRing />
          <PulseRing delayMs={600} />
        </View>
      </View>
      <Text className="mt-6 text-xl font-bold text-ink">산책 기억을 만들고 있어요</Text>
      <Text className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
        기록된 정보를 바탕으로{'\n'}소중한 기억을 정리하고 있어요.
      </Text>
      <ShimmerBars />
    </View>
  );
}

/**
 * Same both ways, and deliberately quicker than ConfirmDeleteSheet's 220ms:
 * that one animates a card onto a screen the user is still reading, while
 * this covers the whole screen on either side of a wait that is already long.
 * At 220ms the cover read as sluggish; this is the tuned value.
 */
const FADE_MS = 100;

/**
 * The same body as a full-screen cover, for the caller that shows the wait on
 * top of a live screen instead of navigating to one.
 *
 * It fades because it has to: a route gets the stack's transition for free, an
 * overlay gets nothing, and cutting to full opacity in one frame reads as a
 * glitch rather than as a screen. The bounce-in on the sprout plays over the
 * arrival, so the body settles as the cover lands.
 *
 * The exit only exists if the caller keeps this mounted after flipping
 * `visible` off — that is what `onHidden` is for. It fires once the fade has
 * actually finished, and not at all if a new wait interrupts it, so a caller
 * that unmounts on it cannot cut the animation short.
 *
 * WHAT the exit uncovers is the caller's job, and the reason this component
 * does not own its own mounting: revealing the screen the user was waiting for
 * is the point, revealing the form they already left is a bug.
 *
 * It stops intercepting touches the instant it starts leaving, so the screen
 * beneath is live as soon as it is legible. On the way in it blocks from the
 * first frame — opacity does not affect hit testing.
 *
 * `className` on an Animated.View is unverified on this stack (see PhotoTile),
 * so the animated wrapper carries style only and the parchment fill sits on a
 * plain child.
 */
export function AiLoadingOverlay({
  visible,
  onHidden,
}: {
  visible: boolean;
  /** Fires after the exit fade completes, so the caller can unmount this. */
  onHidden: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;

  // Held in a ref so a caller's inline arrow cannot restart the animation by
  // changing identity between renders.
  const hidden = useRef(onHidden);
  useEffect(() => {
    hidden.current = onHidden;
  }, [onHidden]);

  useEffect(() => {
    const animation = Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: FADE_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) hidden.current();
    });
    // Interrupting reports finished: false, which is what keeps a re-shown
    // overlay from telling the caller it has gone away.
    return () => animation.stop();
  }, [visible, fade]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 50, opacity: fade }]}>
      <View className="flex-1 bg-parchment">
        <SafeAreaView className="flex-1">
          <AiLoading />
        </SafeAreaView>
      </View>
    </Animated.View>
  );
}
