import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import {
  COMPANION_LABELS,
  EMOTION_LABELS,
  SITUATION_LABELS,
  fromIsoDateTime,
} from '@/api/types';
import { AiLoadingOverlay } from '@/components/ai-loading';
import { PrimaryButton } from '@/components/buttons';
import { ConfirmDeleteSheet } from '@/components/confirm-delete-sheet';
import { ExperienceEditor } from '@/components/experience-editor';
import {
  IcChevronLeft,
  IcClock,
  IcEdit,
  IcImage,
  IcLocation,
  IcTrash,
} from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { formatDurationMinutes, formatKoreanDate, formatTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import { useAuth } from '@/stores/auth-store';
import { useExperiences } from '@/stores/experience-store';

/**
 * 산책 상세 (기능 7, prototype DetailScreen) plus 수정·삭제 (기능 8). Renders
 * the server's snapshot — by spec the detail never depends on the draft or
 * candidate.
 *
 * Editing happens in place: the 수정 button swaps this screen's body for
 * `ExperienceEditor` on the SAME route. The prototype's edit icon leads
 * nowhere (it has no handler), so the form itself is assembled from the diary
 * flow's shipped screens rather than invented. Deleting opens the prototype's
 * own bottom sheet, ported 1:1.
 *
 * Back is driven by a `from` param, mirroring the prototype's `fromArchive`
 * flag. `router.canGoBack()` cannot decide it: the diary flow pushes its own
 * screens and then replaces into this one, so a stack entry exists but leads
 * back into a finished flow. Deleting reuses that same exit.
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

/**
 * 수정·삭제, in the prototype's own arrangement: back on the left, these two on
 * the trailing edge, with the trash slightly dimmer than the pencil.
 *
 * Over a photo they take the same translucent pill the back chevron already
 * wears here — white icons are illegible on a bright photo, which is why that
 * pill exists, and the same is true of these.
 */
function DetailActions({
  overPhoto,
  onEdit,
  onDelete,
}: {
  overPhoto: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tint = overPhoto ? colors.white : colors.inkMuted;
  const chrome = overPhoto ? 'rounded-full bg-black/30 p-2' : 'p-2';
  return (
    <View className="flex-row items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="수정"
        onPress={onEdit}
        hitSlop={8}
        className={`mr-2 active:opacity-70 ${chrome}`}>
        <IcEdit size={18} color={tint} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="삭제"
        onPress={onDelete}
        hitSlop={8}
        className={`active:opacity-70 ${chrome} ${overPhoto ? 'opacity-80' : ''}`}>
        <IcTrash size={18} color={tint} />
      </Pressable>
    </View>
  );
}

export default function ExperienceDetailScreen() {
  const { experienceId, from } = useLocalSearchParams<{ experienceId: string; from?: string }>();
  const phase = useExperiences((state) => state.phase);
  const loadedId = useExperiences((state) => state.experienceId);
  const detail = useExperiences((state) => state.detail);
  const loadExperience = useExperiences((state) => state.loadExperience);
  const editPhase = useExperiences((state) => state.editPhase);
  const editError = useExperiences((state) => state.editError);
  const deletePhase = useExperiences((state) => state.deletePhase);
  const deleteError = useExperiences((state) => state.deleteError);
  const updateExperience = useExperiences((state) => state.updateExperience);
  const deleteExperience = useExperiences((state) => state.deleteExperience);
  const clearWriteErrors = useExperiences((state) => state.clearWriteErrors);
  const signedIn = useAuth((state) => state.status === 'signed-in');

  // Mode lives here, the draft lives in the editor, the request lives in the
  // store — the same split as the nickname field in /settings.
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Gated on the session for the same reason as the list screens: a reload of
  // this URL mounts before the token has been restored.
  useEffect(() => {
    if (!signedIn) return;
    if (typeof experienceId === 'string' && experienceId.length > 0) {
      void loadExperience(experienceId);
    }
  }, [signedIn, experienceId, loadExperience]);

  const goBack = () => router.replace(from === 'archive' ? '/archive' : '/');

  // The saving cover sits outside every branch below, always the second child
  // of the same root, so switching branches underneath it never remounts it.
  // That is the whole reason it can fade OUT: on success the store lands the
  // new `detail` and this screen leaves edit mode in the same commit, so by the
  // time the cover starts going it is already sitting on the finished record.
  // The exit uncovers the destination — never the form the user already left.
  //
  // `editPhase === 'saving'` alone covers its arrival; `overlayLingering` only
  // extends its life past that so the exit has something to play on.
  const [overlayLingering, setOverlayLingering] = useState(false);
  useEffect(() => {
    if (editPhase === 'saving') setOverlayLingering(true);
  }, [editPhase]);

  const withOverlay = (content: ReactNode) => (
    <View className="flex-1">
      {content}
      {editPhase === 'saving' || overlayLingering ? (
        <AiLoadingOverlay
          visible={editPhase === 'saving'}
          onHidden={() => setOverlayLingering(false)}
        />
      ) : null}
    </View>
  );

  if (phase === 'loading' || phase === 'idle' || loadedId !== experienceId) {
    return withOverlay(
      <SafeAreaView className="flex-1 bg-white">
        <ScreenHeader onBack={goBack} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.sage} />
        </View>
      </SafeAreaView>,
    );
  }

  if (phase !== 'ready' || detail === null) {
    return withOverlay(
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
      </SafeAreaView>,
    );
  }

  // After the phase guards on purpose: a 404 arriving mid-edit tears the editor
  // down rather than leaving the user typing into a record that no longer exists.
  if (editing) {
    return withOverlay(
      // The editor is never swapped out for the cover, only covered. Its draft
      // is seeded exactly once (see its own note), so returning the loading
      // body in its place would remount it, and a failed save would hand the
      // user back a form with every edit reverted to the server's values.
      <ExperienceEditor
        detail={detail}
        saving={editPhase === 'saving'}
        error={editError}
        onCancel={() => {
          clearWriteErrors();
          setEditing(false);
        }}
        onSave={(draft) => {
          // The form keeps taps from dismissing the keyboard
          // (keyboardShouldPersistTaps), and no overlay can cover one: on iOS
          // it is an OS window above every RN view, and on web the focused
          // input goes on receiving keystrokes underneath.
          Keyboard.dismiss();
          void updateExperience(detail.experienceId, draft).then((saved) => {
            if (saved) setEditing(false);
          });
        }}
      />,
    );
  }

  const startedAtMs = fromIsoDateTime(detail.startedAt);
  const startedDate = new Date(startedAtMs);
  const day = startedDate.getDate();
  const yearMonth = `${startedDate.getFullYear()} · ${startedDate.getMonth() + 1}월`;

  const actions = (
    <DetailActions
      overPhoto={detail.photoUrl !== null}
      onEdit={() => {
        clearWriteErrors();
        setEditing(true);
      }}
      onDelete={() => {
        clearWriteErrors();
        setConfirming(true);
      }}
    />
  );

  return withOverlay(
    // The sheet is a sibling of the SafeAreaView, not a child, so its backdrop
    // reaches the notch instead of stopping at the safe area's padding.
    <>
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
                accessibilityLabel="뒤로"
                onPress={goBack}
                className="rounded-full bg-black/30 p-2 active:opacity-70"
                hitSlop={8}>
                <IcChevronLeft size={22} color={colors.white} />
              </Pressable>
              <View className="flex-1" />
              {actions}
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
            <ScreenHeader onBack={goBack} right={actions} />
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

      {confirming ? (
        <ConfirmDeleteSheet
          busy={deletePhase === 'deleting'}
          error={deleteError}
          onConfirm={() => {
            void deleteExperience(detail.experienceId).then((removed) => {
              // The store has already dropped the row and cleared the detail,
              // so this screen paints its neutral spinner for the frame before
              // the replace lands — never the "찾을 수 없어요" card.
              if (removed) goBack();
            });
          }}
          onCancel={() => {
            clearWriteErrors();
            setConfirming(false);
          }}
        />
      ) : null}
    </>,
  );
}
