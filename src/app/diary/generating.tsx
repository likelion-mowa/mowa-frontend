import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { colors } from '@/lib/theme';
import { useDiaryFlow } from '@/stores/diary-flow-store';

/**
 * Diary flow step 3 — AI generation (prototype AILoadingScreen).
 *
 * The prototype animates this screen (pulse ring, shimmer); those are Tailwind
 * animate-* classes, unverified on this NativeWind/Reanimated pairing, so the
 * loading state stays static with an ActivityIndicator — a deliberate
 * simplification.
 *
 * The FAILED state has no prototype screen at all: the layout and copy below
 * are derived from the spec's "실패 안내 및 재시도" branch (FAILED → manual
 * retry via the same endpoint) and are flagged for team review in the PR.
 *
 * Success replaces this route with the preview, so the preview's back gesture
 * lands on the context screen, exactly like the prototype's navigation.
 */
export default function DiaryGeneratingScreen() {
  const walk = useDiaryFlow((state) => state.walk);
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
            <PrimaryButton label="다시 시도" onPress={() => void generate()} />
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
      <View className="flex-1 items-center justify-center px-8">
        <View className="items-center">
          <View className="rounded-full bg-sage px-3 py-1.5">
            <Text className="text-xs font-semibold text-white">잠깐만요! ✨</Text>
          </View>
          <View className="mt-4 h-24 w-24 items-center justify-center rounded-full bg-sage-pale">
            <Text className="text-5xl">🌿</Text>
          </View>
        </View>
        <Text className="mt-6 text-xl font-bold text-ink">산책 기억을 만들고 있어요</Text>
        <Text className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
          기록된 정보를 바탕으로{'\n'}소중한 기억을 정리하고 있어요.
        </Text>
        <ActivityIndicator className="mt-6" color={colors.sage} />
        <View className="mt-6 w-full">
          <View className="h-5 w-3/4 rounded-lg bg-parchment-dark" />
          <View className="mt-3 h-3.5 w-full rounded-lg bg-parchment-dark" />
          <View className="mt-3 h-3.5 w-5/6 rounded-lg bg-parchment-dark" />
          <View className="mt-3 h-3.5 w-4/5 rounded-lg bg-parchment-dark" />
        </View>
      </View>
    </SafeAreaView>
  );
}
