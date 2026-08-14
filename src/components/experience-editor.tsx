import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { photoPicker } from '@/adapters';
import {
  COMPANIONS,
  COMPANION_LABELS,
  EMOTIONS,
  EMOTION_LABELS,
  LIMITS,
  SITUATIONS,
  SITUATION_LABELS,
  fromIsoDateTime,
  type WalkExperienceDetail,
} from '@/api/types';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { IcCamera, IcClose, IcGallery } from '@/components/icons';
import {
  COMPANION_EMOJI,
  EMOTION_EMOJI,
  OptionGridRows,
  SITUATION_EMOJI,
  WideOption,
} from '@/components/option-picker';
import { ScreenHeader } from '@/components/screen-header';
import {
  releasePhotoUri,
  seedEditDraft,
  type ExperienceEditDraft,
} from '@/lib/experience-input';
import { formatDurationMinutes, formatKoreanDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';

/**
 * 기능 8 수정 모드 — the full form that replaces the detail view in place (same
 * route, no navigation). Every field the spec allows editing is here; the four
 * snapshot columns are shown read-only at the bottom so "why can't I change the
 * time?" answers itself.
 *
 * Presentational by design: it takes `detail` and hands back a draft, and never
 * imports a store. The screen owns the mode flag, the store owns the request.
 *
 * The draft is seeded once with the lazy `useState` initializer — reactCompiler
 * is on and a re-render must never overwrite what the user is typing. Cancel is
 * literally unmounting this component, which is why the draft lives here and
 * not in the store.
 *
 * Every string is reused: 제목/일기/태그 and the footer from `/diary/edit`, the
 * photo cards from `/diary/photo`, 동반자/기분/상황/산책 정보 from
 * `/diary/preview`'s info rows. Only `사진` is new — flagged for the team.
 */

const SECTION_LABEL = 'mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle';
const TEXT_INPUT = 'rounded-xl border border-line bg-white px-4 py-3.5 text-ink';

export function ExperienceEditor({
  detail,
  saving,
  error,
  onCancel,
  onSave,
}: {
  detail: WalkExperienceDetail;
  saving: boolean;
  /** Save failure from the store. Photo-picker failures are local to this screen. */
  error: string | null;
  onCancel: () => void;
  onSave: (draft: ExperienceEditDraft) => void;
}) {
  const [draft, setDraft] = useState(() => seedEditDraft(detail));
  const [photoError, setPhotoError] = useState<string | null>(null);

  /**
   * Revoke only object URLs THIS editor created. `detail.photoUrl` can itself
   * be a blob: URL — on web the diary flow saves the picked object URL as the
   * photoUrl, since there is no object storage yet — and revoking that would
   * blank the record the user is still looking at.
   */
  const replacePhoto = (uri: string | null) => {
    const previous = draft.photoUrl;
    if (previous !== null && previous !== detail.photoUrl) releasePhotoUri(previous);
    setDraft((prev) => ({ ...prev, photoUrl: uri }));
  };

  const cancel = () => {
    if (draft.photoUrl !== null && draft.photoUrl !== detail.photoUrl) {
      releasePhotoUri(draft.photoUrl);
    }
    onCancel();
  };

  const attach = async (source: 'library' | 'camera') => {
    const picked =
      source === 'library'
        ? await photoPicker.pickFromLibrary()
        : await photoPicker.captureWithCamera();
    if (!picked.ok) {
      // Never silent: a denied camera permission is the common case here.
      console.log(`[MOWA] editor photo ${source} FAILED — ${picked.error}`);
      setPhotoError(picked.error);
      return;
    }
    setPhotoError(null);
    if (picked.value === null) return; // cancelled, not a failure
    replacePhoto(picked.value.uri);
  };

  const sources = [
    { label: '카메라', sub: '지금 촬영하기', icon: IcCamera, source: 'camera' as const },
    { label: '갤러리', sub: '앨범에서 선택', icon: IcGallery, source: 'library' as const },
  ];

  const startedAtMs = fromIsoDateTime(detail.startedAt);
  const infoRows: { label: string; value: string }[] = [
    { label: '날짜', value: `${formatKoreanDate(startedAtMs)} · ${formatTime(startedAtMs)}` },
    ...(detail.locationSummary !== null
      ? [{ label: '장소', value: detail.locationSummary }]
      : []),
    { label: '소요 시간', value: formatDurationMinutes(detail.durationSeconds) },
  ];

  const titleEmpty = draft.title.trim().length === 0;

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader title="기억 수정하기" onBack={cancel} />

      <ScrollView
        className="flex-1 px-5 pt-2"
        contentContainerClassName="pb-6"
        keyboardShouldPersistTaps="handled">
        <View className="mb-5">
          <Text className={SECTION_LABEL}>사진</Text>
          {draft.photoUrl !== null ? (
            <View className="relative">
              <View className="h-56 w-full overflow-hidden rounded-2xl bg-parchment-dark">
                <Image
                  source={{ uri: draft.photoUrl }}
                  className="h-full w-full"
                  resizeMode="cover"
                  accessibilityLabel="산책 사진"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="사진 제거"
                onPress={() => replacePhoto(null)}
                className="absolute right-3 top-3 h-7 w-7 items-center justify-center rounded-full bg-black/50 active:opacity-70">
                <IcClose size={14} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row">
              {sources.map((source, index) => (
                <Pressable
                  key={source.label}
                  accessibilityRole="button"
                  onPress={() => void attach(source.source)}
                  className={`flex-1 items-center rounded-2xl border-2 border-dashed border-line bg-white py-7 active:border-sage ${index > 0 ? 'ml-3' : ''}`}>
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-sage-pale">
                    <source.icon size={22} color={colors.sage} />
                  </View>
                  <Text className="mt-3 text-sm font-medium text-ink">{source.label}</Text>
                  <Text className="mt-0.5 text-xs text-ink-subtle">{source.sub}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {photoError !== null ? (
            <Text className="mt-2 text-xs text-red-500">{photoError}</Text>
          ) : null}
        </View>

        <View className="mb-5">
          <Text className={SECTION_LABEL}>제목</Text>
          <TextInput
            value={draft.title}
            onChangeText={(title) => setDraft((prev) => ({ ...prev, title }))}
            maxLength={LIMITS.titleMaxLength}
            className={`${TEXT_INPUT} text-[17px]`}
            placeholderTextColor={colors.inkSubtle}
          />
        </View>

        <View className="mb-5">
          <Text className={SECTION_LABEL}>일기</Text>
          <TextInput
            value={draft.body}
            onChangeText={(body) => setDraft((prev) => ({ ...prev, body }))}
            multiline
            textAlignVertical="top"
            className={`${TEXT_INPUT} h-44 text-sm leading-relaxed`}
            placeholderTextColor={colors.inkSubtle}
          />
        </View>

        <View className="mb-5">
          <Text className={SECTION_LABEL}>동반자</Text>
          {COMPANIONS.map((code) => (
            <WideOption
              key={code}
              emoji={COMPANION_EMOJI[code]}
              label={COMPANION_LABELS[code]}
              selected={draft.companion === code}
              // Re-tapping the selected option clears it, as in the flow.
              onPress={() =>
                setDraft((prev) => ({
                  ...prev,
                  companion: prev.companion === code ? null : code,
                }))
              }
            />
          ))}
        </View>

        <View className="mb-5">
          <Text className={SECTION_LABEL}>기분</Text>
          <OptionGridRows
            codes={EMOTIONS}
            emoji={EMOTION_EMOJI}
            labels={EMOTION_LABELS}
            isSelected={(code) => draft.emotions.includes(code)}
            onToggle={(code) =>
              setDraft((prev) => ({
                ...prev,
                emotions: prev.emotions.includes(code)
                  ? prev.emotions.filter((emotion) => emotion !== code)
                  : [...prev.emotions, code],
              }))
            }
          />
        </View>

        <View className="mb-5">
          <Text className={SECTION_LABEL}>상황</Text>
          <OptionGridRows
            codes={SITUATIONS}
            emoji={SITUATION_EMOJI}
            labels={SITUATION_LABELS}
            isSelected={(code) => draft.situation === code}
            onToggle={(code) =>
              setDraft((prev) => ({
                ...prev,
                situation: prev.situation === code ? null : code,
              }))
            }
          />
        </View>

        <View className="mb-6">
          <Text className={SECTION_LABEL}>태그</Text>
          <TextInput
            value={draft.tagsInput}
            onChangeText={(tagsInput) => setDraft((prev) => ({ ...prev, tagsInput }))}
            autoCapitalize="none"
            placeholder="#태그를 띄어쓰기로 구분하세요"
            className={`${TEXT_INPUT} text-sm`}
            placeholderTextColor={colors.inkSubtle}
          />
          <Text className="mt-1.5 text-xs text-ink-subtle">띄어쓰기로 태그를 구분해요</Text>
        </View>

        {/* Read-only: the spec puts these four outside the MVP edit scope, and
            showing them makes that visible instead of merely absent. */}
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

        {error !== null ? (
          <Text className="mb-3 text-center text-xs text-red-500">{error}</Text>
        ) : null}

        <View className="flex-row">
          <SecondaryButton className="flex-1" disabled={saving} label="취소" onPress={cancel} />
          <View className="w-3" />
          <PrimaryButton
            className="flex-1"
            disabled={saving || titleEmpty}
            label={saving ? '저장 중…' : '변경사항 저장'}
            onPress={() => onSave(draft)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
