import { Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { COMPANION_LABELS, EMOTION_LABELS, SITUATION_LABELS } from '@/api/types';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { IcSparkle } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { formatDurationMinutes, formatKoreanDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { useDiaryFlow } from '@/stores/diary-flow-store';

/**
 * Diary flow step 4 — AI result preview (prototype AIPreviewScreen).
 *
 * Shows the CURRENT confirmed values (title/body/tags), which equal the AI
 * result until the edit screen changes them. Going back re-opens the context
 * steps; by spec a SUCCESS draft can be neither patched nor regenerated, so
 * later input changes ride on the final POST /walk-experiences — the snapshot
 * endpoint designed to receive the user-confirmed values.
 */
export default function DiaryPreviewScreen() {
  const walk = useDiaryFlow((state) => state.walk);
  const phase = useDiaryFlow((state) => state.generationPhase);
  const photoUri = useDiaryFlow((state) => state.photoUri);
  const companion = useDiaryFlow((state) => state.companion);
  const emotions = useDiaryFlow((state) => state.emotions);
  const situation = useDiaryFlow((state) => state.situation);
  const title = useDiaryFlow((state) => state.title);
  const body = useDiaryFlow((state) => state.body);
  const tags = useDiaryFlow((state) => state.tags);
  const savePhase = useDiaryFlow((state) => state.savePhase);
  const saveError = useDiaryFlow((state) => state.saveError);
  const save = useDiaryFlow((state) => state.save);

  if (walk === null) return <Redirect href="/" />;
  if (phase !== 'success') return <Redirect href="/diary/generating" />;

  const saving = savePhase === 'saving';
  const handleSave = async () => {
    if (await save()) router.replace('/diary/done');
  };

  const infoRows: { label: string; value: string }[] = [
    { label: '날짜', value: `${formatKoreanDate(walk.startedAtMs)} · ${formatTime(walk.startedAtMs)}` },
    ...(walk.locationSummary !== null ? [{ label: '장소', value: walk.locationSummary }] : []),
    { label: '소요 시간', value: formatDurationMinutes(walk.durationSeconds) },
    ...(companion !== null ? [{ label: '동반자', value: COMPANION_LABELS[companion] }] : []),
    ...(emotions.length > 0
      ? [{ label: '기분', value: emotions.map((code) => EMOTION_LABELS[code]).join(', ') }]
      : []),
    ...(situation !== null ? [{ label: '상황', value: SITUATION_LABELS[situation] }] : []),
  ];

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader title="산책 기억 미리보기" onBack={() => router.back()} />

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-6">
        {photoUri !== null ? (
          <View className="mb-4 h-44 w-full overflow-hidden rounded-2xl bg-parchment-dark">
            <Image
              source={{ uri: photoUri }}
              className="h-full w-full"
              resizeMode="cover"
              accessibilityLabel="산책 사진"
            />
          </View>
        ) : null}

        <View className="mb-5 flex-row items-start rounded-xl border border-sage/20 bg-sage-pale/60 p-3">
          <View className="mt-0.5">
            <IcSparkle size={14} color={colors.sage} />
          </View>
          <Text className="ml-2.5 flex-1 text-xs leading-relaxed text-sage-dark">
            선택한 정보와 기록된 활동 내용을 바탕으로 생성되었습니다. 실제와 다른 내용은 수정해주세요.
          </Text>
        </View>

        <View className="mb-4">
          <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            제목
          </Text>
          <Text className="text-[22px] font-bold leading-snug text-ink">{title}</Text>
        </View>

        <View className="mb-4">
          <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            일기
          </Text>
          <View className="rounded-xl border border-line bg-white p-4">
            <Text className="text-sm leading-relaxed text-ink">{body}</Text>
          </View>
        </View>

        {tags.length > 0 ? (
          <View className="mb-5">
            <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
              태그
            </Text>
            <View className="flex-row flex-wrap">
              {tags.map((tag) => (
                <View key={tag} className="mb-1.5 mr-1.5 rounded-full bg-sage-pale px-3 py-1.5">
                  <Text className="text-xs font-medium text-sage-dark">#{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mb-5 rounded-2xl border border-line bg-white p-4">
          <Text className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            산책 정보
          </Text>
          {infoRows.map((row, index) => (
            <View
              key={row.label}
              className={`flex-row items-center justify-between ${index > 0 ? 'mt-2.5' : ''}`}>
              <Text className="text-xs text-ink-muted">{row.label}</Text>
              <Text className="ml-3 flex-shrink text-right text-sm font-medium text-ink">
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {saveError !== null ? (
          <Text className="mb-3 text-center text-xs text-red-500">{saveError}</Text>
        ) : null}

        <View className="flex-row">
          <SecondaryButton
            className="flex-1"
            disabled={saving}
            label="수정하기"
            onPress={() => router.push('/diary/edit')}
          />
          <View className="w-3" />
          <PrimaryButton
            className="flex-1"
            disabled={saving}
            label={saving ? '저장 중…' : '저장하기'}
            onPress={() => void handleSave()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
