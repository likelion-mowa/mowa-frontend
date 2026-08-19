import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { AiLoading } from '@/components/ai-loading';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { useDiaryFlow } from '@/stores/diary-flow-store';

/**
 * Diary flow step 3 — AI generation (prototype AILoadingScreen).
 *
 * The waiting body itself lives in components/ai-loading.tsx: 수정 on
 * /experiences/[experienceId] waits on the same OpenAI round trip and shows
 * the same thing, so neither screen owns it.
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
      <AiLoading />
    </SafeAreaView>
  );
}
