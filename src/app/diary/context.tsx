import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import {
  COMPANIONS,
  COMPANION_LABELS,
  EMOTIONS,
  EMOTION_LABELS,
  SITUATIONS,
  SITUATION_LABELS,
  type Companion,
  type Emotion,
  type Situation,
} from '@/api/types';
import { PrimaryButton } from '@/components/buttons';
import { ScreenHeader } from '@/components/screen-header';
import { useDiaryFlow } from '@/stores/diary-flow-store';

/**
 * Diary flow step 2 — context (prototype CreateDetailsScreen): three in-screen
 * steps for companion, emotions and situation. Everything is optional by spec;
 * "선택 없이 계속하기" jumps straight to generation from any step.
 *
 * Codes and labels come from src/api/types.ts (the spec's own vocabulary) —
 * they happen to match the prototype's strings exactly. Emotions are
 * multi-select: the spec's emotions[] and the prototype's own copy ("여러 개를
 * 선택해도 괜찮아요") agree, even though the prototype's implementation was
 * single-select.
 */

const COMPANION_EMOJI: Record<Companion, string> = {
  ALONE: '🧘',
  WITH_SOMEONE: '👫',
  PET: '🐾',
};

const EMOTION_EMOJI: Record<Emotion, string> = {
  CALM: '😌',
  HAPPY: '😊',
  TIRED: '😮‍💨',
  REFRESHED: '🌿',
  PENSIVE: '🤔',
};

const SITUATION_EMOJI: Record<Situation, string> = {
  MORNING: '🌅',
  AFTERNOON: '☀️',
  EVENING: '🌆',
  IN_TRANSIT: '🚶',
  EXPLORING: '🗺️',
};

function WideOption({
  emoji,
  label,
  selected,
  onPress,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`mb-3 flex-row items-center rounded-2xl border-2 px-5 py-4 active:opacity-80 ${
        selected ? 'border-sage bg-sage' : 'border-line bg-white'
      }`}>
      <Text className="text-3xl">{emoji}</Text>
      <Text className={`ml-4 text-[17px] font-semibold ${selected ? 'text-white' : 'text-ink'}`}>
        {label}
      </Text>
      {selected ? <Text className="ml-auto text-lg text-white/80">✓</Text> : null}
    </Pressable>
  );
}

function GridOption({
  emoji,
  label,
  selected,
  onPress,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`mb-3 w-[48%] items-center rounded-2xl border-2 py-6 active:opacity-80 ${
        selected ? 'border-sage bg-sage' : 'border-line bg-white'
      }`}>
      <Text className="text-3xl">{emoji}</Text>
      <Text className={`mt-2 text-[15px] font-semibold ${selected ? 'text-white' : 'text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function DiaryContextScreen() {
  const walk = useDiaryFlow((state) => state.walk);
  const companion = useDiaryFlow((state) => state.companion);
  const emotions = useDiaryFlow((state) => state.emotions);
  const situation = useDiaryFlow((state) => state.situation);
  const setCompanion = useDiaryFlow((state) => state.setCompanion);
  const toggleEmotion = useDiaryFlow((state) => state.toggleEmotion);
  const setSituation = useDiaryFlow((state) => state.setSituation);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  if (walk === null) {
    return <Redirect href="/" />;
  }

  const goGenerate = () => router.push('/diary/generating');
  const handleBack = () => {
    if (step === 1) router.back();
    else setStep((current) => (current - 1) as 1 | 2);
  };
  const handleNext = () => {
    if (step === 3) goGenerate();
    else setStep((current) => (current + 1) as 2 | 3);
  };

  const steps = {
    1: { question: '함께였나요?', sub: '산책 동반자를 선택해주세요' },
    2: { question: '기분이 어땠나요?', sub: '여러 개를 선택해도 괜찮아요' },
    3: { question: '어떤 상황이었나요?', sub: '산책의 맥락을 알려주세요' },
  } as const;

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader
        onBack={handleBack}
        center={
          <View className="flex-row items-center">
            {([1, 2, 3] as const).map((dot) => (
              <View
                key={dot}
                className={`mx-0.5 h-1.5 rounded-full ${
                  dot === step ? 'w-5 bg-sage' : dot < step ? 'w-1.5 bg-sage' : 'w-1.5 bg-line'
                }`}
              />
            ))}
          </View>
        }
      />
      <View className="absolute right-4 top-14">
        <Text className="text-[11px] font-medium text-ink-subtle">{step} / 3</Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-4" contentContainerClassName="pb-4">
        <Text className="mb-1.5 text-[28px] font-bold leading-tight text-ink">
          {steps[step].question}
        </Text>
        <Text className="mb-8 text-sm text-ink-muted">{steps[step].sub}</Text>

        {step === 1 ? (
          <View>
            {COMPANIONS.map((code) => (
              <WideOption
                key={code}
                emoji={COMPANION_EMOJI[code]}
                label={COMPANION_LABELS[code]}
                selected={companion === code}
                onPress={() => setCompanion(companion === code ? null : code)}
              />
            ))}
          </View>
        ) : null}

        {step === 2 ? (
          <View className="flex-row flex-wrap justify-between">
            {EMOTIONS.map((code) => (
              <GridOption
                key={code}
                emoji={EMOTION_EMOJI[code]}
                label={EMOTION_LABELS[code]}
                selected={emotions.includes(code)}
                onPress={() => toggleEmotion(code)}
              />
            ))}
          </View>
        ) : null}

        {step === 3 ? (
          <View className="flex-row flex-wrap justify-between">
            {SITUATIONS.map((code) => (
              <GridOption
                key={code}
                emoji={SITUATION_EMOJI[code]}
                label={SITUATION_LABELS[code]}
                selected={situation === code}
                onPress={() => setSituation(situation === code ? null : code)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View className="px-5 pb-8 pt-3">
        <PrimaryButton
          label={step === 3 ? '산책 기억 만들기' : '다음으로'}
          onPress={handleNext}
        />
        <Pressable
          accessibilityRole="button"
          onPress={goGenerate}
          className="mt-1 py-3 active:opacity-70">
          <Text className="text-center text-sm font-medium text-ink-subtle">선택 없이 계속하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
