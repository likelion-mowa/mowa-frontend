import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import {
  COMPANIONS,
  COMPANION_LABELS,
  EMOTIONS,
  EMOTION_LABELS,
  SITUATIONS,
  SITUATION_LABELS,
} from '@/api/types';
import { PrimaryButton } from '@/components/buttons';
import {
  COMPANION_EMOJI,
  EMOTION_EMOJI,
  OptionGridRows,
  SITUATION_EMOJI,
  WideOption,
} from '@/components/option-picker';
import { ScreenHeader } from '@/components/screen-header';
import { StepDots } from '@/components/step-dots';
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
 *
 * Motion mirrors the prototype's CSS transitions via RN Animated: option
 * selection eases over ~220ms (duration-200, in @/components/option-picker),
 * the step dots morph over 300ms (duration-300, in @/components/step-dots), and
 * each step's content slides in like the prototype's rail.
 */

export default function DiaryContextScreen() {
  const walk = useDiaryFlow((state) => state.walk);
  const experienceId = useDiaryFlow((state) => state.experienceId);
  const generationPhase = useDiaryFlow((state) => state.generationPhase);
  const companion = useDiaryFlow((state) => state.companion);
  const emotions = useDiaryFlow((state) => state.emotions);
  const situation = useDiaryFlow((state) => state.situation);
  const setCompanion = useDiaryFlow((state) => state.setCompanion);
  const toggleEmotion = useDiaryFlow((state) => state.toggleEmotion);
  const setSituation = useDiaryFlow((state) => state.setSituation);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Direction-aware slide-in on step change, echoing the prototype's rail.
  const slideX = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    const forward = step > previousStep.current;
    previousStep.current = step;
    slideX.setValue(forward ? 32 : -32);
    slideOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(slideX, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(slideOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [step, slideX, slideOpacity]);

  if (walk === null) {
    return <Redirect href="/" />;
  }
  // Completed flows are read-only — see the photo screen's guard.
  if (experienceId !== null) {
    return <Redirect href="/diary/done" />;
  }

  // After SUCCESS the draft can neither be patched nor regenerated (spec), so
  // input changes ride on the final snapshot POST — going through the loading
  // screen again would be a no-op dressed as work. Straight to the preview.
  const goGenerate = () =>
    router.push(generationPhase === 'success' ? '/diary/preview' : '/diary/generating');
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
      <ScreenHeader onBack={handleBack} center={<StepDots total={3} current={step} />} />
      <View className="absolute right-4 top-14">
        <Text className="text-[11px] font-medium text-ink-subtle">{step} / 3</Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-4" contentContainerClassName="pb-4">
        <Animated.View style={{ transform: [{ translateX: slideX }], opacity: slideOpacity }}>
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
            <OptionGridRows
              codes={EMOTIONS}
              emoji={EMOTION_EMOJI}
              labels={EMOTION_LABELS}
              isSelected={(code) => emotions.includes(code)}
              onToggle={toggleEmotion}
            />
          ) : null}

          {step === 3 ? (
            <OptionGridRows
              codes={SITUATIONS}
              emoji={SITUATION_EMOJI}
              labels={SITUATION_LABELS}
              isSelected={(code) => situation === code}
              onToggle={(code) => setSituation(situation === code ? null : code)}
            />
          ) : null}
        </Animated.View>
      </ScrollView>

      <View className="px-5 pb-8 pt-3">
        <PrimaryButton
          glow
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
