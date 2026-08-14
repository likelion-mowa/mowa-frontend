import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { shadows } from '@/lib/theme';
import { useDiaryFlow } from '@/stores/diary-flow-store';

/**
 * Diary flow step 3 — AI generation (prototype AILoadingScreen).
 *
 * The prototype's pulse-ring / bounce-in / shimmer are CSS keyframes; here
 * they are RN core Animated loops (NativeWind's animate-* classes are
 * unverified on this stack, Animated is not).
 *
 * The FAILED state has no prototype screen at all: the layout and copy below
 * are derived from the spec's "실패 안내 및 재시도" branch (FAILED → manual
 * retry via the same endpoint) and are flagged for team review in the PR.
 *
 * Success replaces this route with the preview, so the preview's back gesture
 * lands on the context screen, exactly like the prototype's navigation.
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

function LoadingBody() {
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

export default function DiaryGeneratingScreen() {
  const walk = useDiaryFlow((state) => state.walk);
  const experienceId = useDiaryFlow((state) => state.experienceId);
  const phase = useDiaryFlow((state) => state.generationPhase);
  const generate = useDiaryFlow((state) => state.generate);

  useEffect(() => {
    void generate();
  }, [generate]);

  useEffect(() => {
    if (phase === 'success') router.replace('/diary/preview');
  }, [phase]);

  if (walk === null) {
    return <Redirect href="/" />;
  }
  // Completed flows are read-only — see the photo screen's guard.
  if (experienceId !== null) {
    return <Redirect href="/diary/done" />;
  }

  if (phase === 'failed') {
    return (
      <SafeAreaView className="flex-1 bg-parchment">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-parchment-dark">
            <Text className="text-5xl">🥀</Text>
          </View>
          <Text className="mt-6 text-xl font-bold text-ink">산책 기억을 만들지 못했어요</Text>
          <Text className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
            일시적인 문제일 수 있어요.{'\n'}잠시 후 다시 시도해주세요.
          </Text>
          <View className="mt-8 w-full">
            <PrimaryButton glow label="다시 시도" onPress={() => void generate()} />
            <SecondaryButton
              className="mt-3"
              label="입력 수정하기"
              onPress={() => router.back()}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <LoadingBody />
    </SafeAreaView>
  );
}
