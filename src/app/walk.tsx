import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * 기록 제안 화면. Entered by tapping the walk notification (routing lives in
 * _layout.tsx), which is the user flow's "기록 작성 희망 여부" decision point:
 * 남기기 → RECORDING, 건너뛰기 → SKIPPED.
 *
 * Copy is deliberately thin. The spec names exactly two strings for this
 * screen — `남기기` and `건너뛰기` (api-spec.md 기능 1) — and the headline is the
 * notification title the app already ships. The row labels are the spec's own
 * field vocabulary (시작·종료 시각, 지속 시간). Nothing else is invented here;
 * failures go to the flow log, not to made-up on-screen wording.
 *
 * Screens never touch adapters or the api client: everything comes from the
 * store.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-100 py-3">
      <Text className="text-sm text-neutral-500">{label}</Text>
      <Text className="ml-3 flex-shrink text-right text-base text-neutral-900">{value}</Text>
    </View>
  );
}

function formatTime(epochMs: number | null): string {
  if (epochMs === null) return '—';
  return new Date(epochMs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${Math.max(1, Math.round(seconds / 60))}분`;
}

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

  // Declarative, so a redirect cannot race the navigator's readiness: nothing
  // is left to act on, and the home screen is where the flow ends.
  if (opened.current && (phase === 'missing' || phase === 'done')) {
    return <Redirect href="/" />;
  }

  if (!opened.current || candidate === null || phase === 'idle' || phase === 'loading') {
    return <SafeAreaView className="flex-1 bg-walk-soft" />;
  }

  const busy = phase !== 'ready';

  return (
    <SafeAreaView className="flex-1 bg-walk-soft">
      <View className="flex-1 justify-center px-6">
        <View className="rounded-2xl bg-white p-6">
          <Text className="text-2xl font-bold text-neutral-900">걷기가 감지되었습니다</Text>

          <View className="mt-4">
            <Row label="시작 시각" value={formatTime(candidate.startedAtMs)} />
            <Row label="종료 시각" value={formatTime(candidate.endedAtMs)} />
            <Row label="지속 시간" value={formatDuration(candidate.durationSeconds)} />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void chooseKeep()}
            className={`mt-8 rounded-xl bg-walk px-4 py-4 active:opacity-70 ${busy ? 'opacity-50' : ''}`}>
            <Text className="text-center text-base font-semibold text-white">남기기</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void chooseSkip()}
            className={`mt-3 rounded-xl bg-neutral-200 px-4 py-4 active:opacity-70 ${busy ? 'opacity-50' : ''}`}>
            <Text className="text-center text-base font-semibold text-neutral-600">건너뛰기</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
