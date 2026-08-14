import { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import {
  COMPANION_LABELS,
  EMOTION_LABELS,
  SITUATION_LABELS,
  fromIsoDateTime,
} from '@/api/types';
import { PrimaryButton } from '@/components/buttons';
import { IcChevronLeft, IcClock, IcImage, IcLocation } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { formatDurationMinutes, formatKoreanDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { useExperiences } from '@/stores/experience-store';

/**
 * 산책 상세 (기능 7, prototype DetailScreen). Renders the server's snapshot —
 * by spec the detail never depends on the draft or candidate.
 *
 * The prototype's edit/delete header icons are omitted: 기능 8 (수정·삭제) is a
 * later task and dead buttons would be worse than none — flagged for team
 * review in the PR.
 *
 * Back is driven by a `from` param, mirroring the prototype's `fromArchive`
 * flag. `router.canGoBack()` cannot decide it: the diary flow pushes its own
 * screens and then replaces into this one, so a stack entry exists but leads
 * back into a finished flow.
 */

function Badge({ label, tone }: { label: string; tone: 'green' | 'neutral' }) {
  return (
    <View
      className={`mb-1.5 mr-1.5 rounded-full px-3 py-1 ${
        tone === 'green' ? 'bg-sage-pale' : 'bg-parchment-dark'
      }`}>
      <Text className={`text-xs font-medium ${tone === 'green' ? 'text-sage-dark' : 'text-ink-muted'}`}>
        {label}
      </Text>
    </View>
  );
}

export default function ExperienceDetailScreen() {
  const { experienceId, from } = useLocalSearchParams<{ experienceId: string; from?: string }>();
  const phase = useExperiences((state) => state.phase);
  const loadedId = useExperiences((state) => state.experienceId);
  const detail = useExperiences((state) => state.detail);
  const loadExperience = useExperiences((state) => state.loadExperience);

  useEffect(() => {
    if (typeof experienceId === 'string' && experienceId.length > 0) {
      void loadExperience(experienceId);
    }
  }, [experienceId, loadExperience]);

  const goBack = () => router.replace(from === 'archive' ? '/archive' : '/');

  if (phase === 'loading' || phase === 'idle' || loadedId !== experienceId) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <ScreenHeader onBack={goBack} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.sage} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase !== 'ready' || detail === null) {
    return (
      <SafeAreaView className="flex-1 bg-parchment">
        <ScreenHeader onBack={goBack} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-lg font-bold text-ink">
            {phase === 'not-found' ? '기록을 찾을 수 없어요' : '기록을 불러오지 못했어요'}
          </Text>
          <Text className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
            {phase === 'not-found'
              ? '삭제되었거나 존재하지 않는 기록이에요.'
              : '네트워크 상태를 확인하고 다시 시도해주세요.'}
          </Text>
          <View className="mt-8 w-full">
            <PrimaryButton
              label={from === 'archive' ? '기록장으로 돌아가기' : '홈으로 돌아가기'}
              onPress={goBack}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const startedAtMs = fromIsoDateTime(detail.startedAt);
  const startedDate = new Date(startedAtMs);
  const day = startedDate.getDate();
  const yearMonth = `${startedDate.getFullYear()} · ${startedDate.getMonth() + 1}월`;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {detail.photoUrl !== null ? (
        <View className="h-72 w-full">
          <Image
            source={{ uri: detail.photoUrl }}
            className="h-full w-full"
            resizeMode="cover"
            accessibilityLabel={detail.title}
          />
          <View className="absolute left-0 right-0 top-0 flex-row items-center px-3 py-1">
            <Pressable
              accessibilityRole="button"
              onPress={goBack}
              className="rounded-full bg-black/30 p-2 active:opacity-70"
              hitSlop={8}>
              <IcChevronLeft size={22} color={colors.white} />
            </Pressable>
          </View>
          <View className="absolute bottom-5 left-5">
            <Text className="mb-0.5 text-xs tracking-wider text-white/60">{yearMonth}</Text>
            <View className="flex-row items-baseline">
              <Text className="text-[52px] font-bold leading-none text-white">{day}</Text>
              <Text className="ml-1 text-[28px] font-semibold text-white/80">일</Text>
            </View>
          </View>
        </View>
      ) : (
        <View className="bg-parchment">
          <ScreenHeader onBack={goBack} />
          <View className="mx-5 mb-2 h-24 items-center justify-center rounded-2xl border border-sage/20 bg-sage-pale/50">
            <IcImage size={28} color={colors.sage} />
            <Text className="mt-1 text-xs text-sage">사진 없음</Text>
          </View>
        </View>
      )}

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-5">
        <View className="mb-4 flex-row flex-wrap">
          {detail.emotions.map((code) => (
            <Badge key={code} label={EMOTION_LABELS[code]} tone="green" />
          ))}
          {detail.companion !== null ? (
            <Badge label={COMPANION_LABELS[detail.companion]} tone="neutral" />
          ) : null}
          {detail.situation !== null ? (
            <Badge label={SITUATION_LABELS[detail.situation]} tone="neutral" />
          ) : null}
        </View>

        <Text className="mb-4 text-[24px] leading-snug text-ink">{detail.title}</Text>

        <View className="mb-5 flex-row items-center border-b border-line pb-4">
          <View className="flex-row items-center">
            <IcClock size={13} color={colors.inkMuted} />
            <Text className="ml-1.5 text-xs text-ink-muted">
              {formatDurationMinutes(detail.durationSeconds)}
            </Text>
          </View>
          {detail.locationSummary !== null ? (
            <View className="ml-4 flex-1 flex-row items-center">
              <IcLocation size={13} color={colors.inkMuted} />
              <Text className="ml-1.5 text-xs text-ink-muted" numberOfLines={1}>
                {detail.locationSummary}
              </Text>
            </View>
          ) : (
            <View className="flex-1" />
          )}
          <Text className="ml-3 text-xs text-ink-subtle">{formatTime(startedAtMs)}</Text>
        </View>

        {detail.body !== null ? (
          <Text className="mb-6 text-sm leading-7 text-ink">{detail.body}</Text>
        ) : null}

        {detail.tags.length > 0 ? (
          <View className="mb-5 flex-row flex-wrap">
            {detail.tags.map((tag) => (
              <View key={tag} className="mb-1.5 mr-1.5 rounded-full bg-parchment px-3 py-1.5">
                <Text className="text-xs text-ink-muted">#{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="text-xs text-ink-subtle">{formatKoreanDate(startedAtMs)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
