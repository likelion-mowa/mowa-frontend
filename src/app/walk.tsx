import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { IcWalk } from '@/components/icons';
import {
  daypartLabel,
  durationMinutes,
  formatKoreanDate,
  formatTime,
  relativeLabel,
} from '@/lib/format';
import { colors, shadows } from '@/lib/theme';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * 기록 제안 화면. Entered by tapping the walk notification (routing lives in
 * _layout.tsx), which is the user flow's "기록 작성 희망 여부" decision point:
 * 저장할게요 → RECORDING, 괜찮아요 → SKIPPED.
 *
 * Layout and copy follow the prototype's NotificationScreen
 * (Walklog Mobile App MVP src/App.tsx). The button labels replaced the spec's
 * 남기기/건너뛰기 — a team-owned copy decision recorded in the PR. The brand
 * line says Mowa, not the prototype's "Walklog" (the prototype is internally
 * inconsistent; every other screen says MOWA).
 *
 * Screens never touch adapters or the api client: everything comes from the
 * store. 저장할게요 leads into the diary flow (/diary/photo); everything else
 * still ends at home.
 */
export default function WalkSuggestionScreen() {
  const phase = useWalkCandidateFlow((state) => state.suggestionPhase);
  const candidate = useWalkCandidateFlow((state) => state.activeCandidate);
  const openSuggestion = useWalkCandidateFlow((state) => state.openSuggestion);
  const chooseKeep = useWalkCandidateFlow((state) => state.chooseKeep);
  const chooseSkip = useWalkCandidateFlow((state) => state.chooseSkip);

  // No unmount cleanup on purpose: a notification tap can mount this screen
  // twice, and resetting shared state on the first unmount cancelled the
  // second mount's work (measured on device 2026-08-14). Instead the phase
  // left over from a previous visit is ignored until this mount's own
  // openSuggestion has started, which is what `opened` marks.
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
    void openSuggestion();
  }, [openSuggestion]);

  // Declarative, so a redirect cannot race the navigator's readiness. 저장할게요
  // continues into the diary flow; a skip or a stale tap ends at home.
  if (opened.current && (phase === 'missing' || phase === 'done')) {
    return (
      <Redirect href={candidate?.serverStatus === 'RECORDING' ? '/diary/photo' : '/'} />
    );
  }

  if (!opened.current || candidate === null || phase === 'idle' || phase === 'loading') {
    return <SafeAreaView className="flex-1 bg-parchment" />;
  }

  const busy = phase !== 'ready';

  // The prototype hardcodes '방금 전' and '오늘 오후' — real taps can be hours
  // old and morning walks exist, so both derive from the candidate instead.
  const nowMs = Date.now();
  const referenceMs = candidate.endedAtMs ?? candidate.startedAtMs;
  const isToday = new Date(referenceMs).toDateString() === new Date(nowMs).toDateString();
  const daypart = `${isToday ? '오늘 ' : ''}${daypartLabel(candidate.startedAtMs)}`;

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      {/* Notification-style banner, echoing the push the user just tapped. */}
      <View className="px-4 pt-2">
        <View style={shadows.banner} className="overflow-hidden rounded-2xl border border-line bg-white">
          <View className="flex-row items-center border-b border-line px-4 py-3">
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-sage">
              <IcWalk size={16} color={colors.white} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-xs font-semibold text-ink">Mowa</Text>
              <Text className="text-[11px] text-ink-subtle">
                {relativeLabel(referenceMs, nowMs)}
              </Text>
            </View>
          </View>
          <View className="px-4 py-3.5">
            <Text className="mb-0.5 text-sm font-semibold text-ink">방금 산책을 마쳤네요 🌿</Text>
            <Text className="text-xs leading-relaxed text-ink-muted">
              {daypart}의 산책을 기억으로 남겨볼까요?
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-1 px-4 py-2">
        <View style={shadows.card} className="rounded-2xl border border-line bg-white p-5">
          {/* 18px regular, not bold — the prototype's display headlines carry no bold. */}
          <Text className="mb-2 text-[18px] leading-snug text-ink">
            이 산책을 기억으로{'\n'}남겨볼까요?
          </Text>
          <Text className="mb-5 text-sm leading-relaxed text-ink-muted">
            지금 저장하지 않으면 기록이 남지 않아요. 1분이면 충분해요.
          </Text>

          <View className="mb-5 flex-row items-center rounded-xl bg-parchment p-4">
            <View className="w-14 flex-shrink-0 items-center">
              <Text className="text-2xl font-bold leading-none text-sage">
                {durationMinutes(candidate.durationSeconds)}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted">분</Text>
            </View>
            <View className="mx-4 w-px self-stretch bg-line" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-ink">
                {formatTime(candidate.startedAtMs)}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-subtle">
                {formatKoreanDate(candidate.startedAtMs)}
              </Text>
            </View>
          </View>

          <View className="flex-row">
            <PrimaryButton
              className="flex-1"
              disabled={busy}
              label="저장할게요"
              onPress={() => void chooseKeep()}
            />
            <View className="w-3" />
            <SecondaryButton
              className="flex-1"
              disabled={busy}
              label="괜찮아요"
              onPress={() => void chooseSkip()}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
