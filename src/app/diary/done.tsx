import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { PrimaryButton } from '@/components/buttons';
import { formatDurationMinutes, formatTime } from '@/lib/format';
import { shadows } from '@/lib/theme';
import { useDiaryFlow } from '@/stores/diary-flow-store';

/**
 * Diary flow step 6 — saved (prototype SaveSuccessScreen). The leaf circle
 * bounces in like the prototype's `bounce-in` keyframe (RN Animated spring —
 * NativeWind's animate-* classes are unverified on this stack).
 *
 * The prototype's primary button says "기록장 보기", but the archive is a later
 * task — until it exists the button reads "일기 보기" and opens the detail
 * screen the flow just created (flagged for team review in the PR).
 */
export default function DiaryDoneScreen() {
  const walk = useDiaryFlow((state) => state.walk);
  const experienceId = useDiaryFlow((state) => state.experienceId);

  const pop = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      friction: 4,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [pop]);

  if (walk === null || experienceId === null) return <Redirect href="/" />;

  const summary = [
    formatTime(walk.startedAtMs),
    ...(walk.locationSummary !== null ? [walk.locationSummary] : []),
    formatDurationMinutes(walk.durationSeconds),
  ].join(' · ');

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <View className="flex-1 items-center justify-center px-8">
        <View className="items-center">
          <View style={shadows.badgeGlow} className="rounded-full bg-sage px-3 py-1.5">
            <Text className="text-xs font-bold text-white">저장 완료! 🎉</Text>
          </View>
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <View className="mt-4 h-24 w-24 items-center justify-center rounded-full bg-sage-pale">
              <Text className="text-5xl">🌿</Text>
            </View>
          </Animated.View>
        </View>

        <Text className="mt-5 text-center text-[24px] font-bold leading-snug text-ink">
          산책 기억이{'\n'}저장되었어요
        </Text>
        <Text className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
          {summary}
          {'\n'}기록장에 소중히 담겼어요.
        </Text>

        <View className="mt-8 w-full">
          <PrimaryButton
            glow
            label="일기 보기"
            onPress={() => router.replace(`/experiences/${experienceId}`)}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/')}
            className="mt-3 py-3 active:opacity-70">
            <Text className="text-center text-sm font-medium text-ink-muted">홈으로 돌아가기</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
