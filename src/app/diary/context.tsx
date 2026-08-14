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
  type Companion,
  type Emotion,
  type Situation,
} from '@/api/types';
import { PrimaryButton } from '@/components/buttons';
import { ScreenHeader } from '@/components/screen-header';
import { useAnimatedToggle, usePressScale } from '@/lib/animations';
import { colors } from '@/lib/theme';
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
 * selection eases over ~220ms (duration-200), the step dots morph over 300ms
 * (duration-300), and each step's content slides in like the prototype's rail.
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

/** Selection colors easing between the unselected and sage states. */
function useSelectColors(selected: boolean) {
  const anim = useAnimatedToggle(selected, 220);
  return {
    backgroundColor: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.white, colors.sage],
    }),
    borderColor: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.line, colors.sage],
    }),
    labelColor: anim.interpolate({ inputRange: [0, 1], outputRange: [colors.ink, colors.white] }),
    checkOpacity: anim,
  };
}

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
  const { scale, onPressIn, onPressOut } = usePressScale();
  const sel = useSelectColors(selected);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className="mb-3">
      {/* Scale on the native driver, colors on the JS driver — separate views. */}
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View
          style={{
            backgroundColor: sel.backgroundColor,
            borderColor: sel.borderColor,
            borderWidth: 2,
            borderRadius: 16,
          }}>
          <View className="flex-row items-center px-5 py-4">
            <Text className="text-3xl">{emoji}</Text>
            <Animated.Text
              style={{ marginLeft: 16, fontSize: 17, fontWeight: '600', color: sel.labelColor }}>
              {label}
            </Animated.Text>
            <View className="flex-1" />
            <Animated.Text style={{ fontSize: 18, color: colors.white, opacity: sel.checkOpacity }}>
              ✓
            </Animated.Text>
          </View>
        </Animated.View>
      </Animated.View>
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
  const { scale, onPressIn, onPressOut } = usePressScale();
  const sel = useSelectColors(selected);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className="mb-3 w-[48%]">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View
          style={{
            backgroundColor: sel.backgroundColor,
            borderColor: sel.borderColor,
            borderWidth: 2,
            borderRadius: 16,
          }}>
          <View className="items-center py-6">
            <Text className="text-3xl">{emoji}</Text>
            <Animated.Text
              style={{ marginTop: 8, fontSize: 15, fontWeight: '600', color: sel.labelColor }}>
              {label}
            </Animated.Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function OptionGridRows<T extends string>({
  codes,
  emoji,
  labels,
  isSelected,
  onToggle,
}: {
  codes: readonly T[];
  emoji: Record<T, string>;
  labels: Record<T, string>;
  isSelected: (code: T) => boolean;
  onToggle: (code: T) => void;
}) {
  const rows: T[][] = [];
  for (let i = 0; i < codes.length; i += 2) rows.push(codes.slice(i, i + 2) as T[]);
  return (
    <View>
      {rows.map((row, index) => (
        // A lone last option sits centered — the prototype spans it across
        // both columns (gridColumn '1 / -1', margin auto) at half width.
        <View
          key={index}
          className={`flex-row ${row.length === 1 ? 'justify-center' : 'justify-between'}`}>
          {row.map((code) => (
            <GridOption
              key={code}
              emoji={emoji[code]}
              label={labels[code]}
              selected={isSelected(code)}
              onPress={() => onToggle(code)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Prototype step dots: the active dot widens 6→20 and reached dots turn sage, over 300ms. */
function StepDot({ reached, active }: { reached: boolean; active: boolean }) {
  const activeAnim = useAnimatedToggle(active, 300);
  const reachedAnim = useAnimatedToggle(reached, 300);
  return (
    <Animated.View
      style={{
        height: 6,
        borderRadius: 999,
        marginHorizontal: 2,
        width: activeAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 20] }),
        backgroundColor: reachedAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [colors.line, colors.sage],
        }),
      }}
    />
  );
}

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
      <ScreenHeader
        onBack={handleBack}
        center={
          <View className="flex-row items-center">
            {([1, 2, 3] as const).map((dot) => (
              <StepDot key={dot} reached={dot <= step} active={dot === step} />
            ))}
          </View>
        }
      />
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
