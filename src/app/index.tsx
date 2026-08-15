import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import type { DetectedWalk } from '@/adapters';
import type { WalkExperienceListItem } from '@/api/types';
import { CharacterHero } from '@/components/character-hero';
import { GlassBarShell, GlassCircleButton, GlassPill } from '@/components/glass-bar';
import { IcChevronRight, IcDocument, IcUser } from '@/components/icons';
import { MowaFace } from '@/components/mowa-face';
import { WalkPhoto } from '@/components/walk-photo';
import { usePressScale, useAnimatedToggle } from '@/lib/animations';
import { formatDurationMinutes, formatTime, relativeLabel } from '@/lib/format';
import { kstPartsFromIso } from '@/lib/kst';
import { colors, shadows } from '@/lib/theme';
import { useAuth } from '@/stores/auth-store';
import { useDiaryFlow } from '@/stores/diary-flow-store';
import { useExperiences } from '@/stores/experience-store';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * Home (prototype HomeScreen, src/App.tsx 1118-1288) — the first screen of the
 * app and the one a hackathon judge opens on the deployed web URL. Developer
 * diagnostics stay on /debug.
 *
 * The character block itself lives in components/character-hero — onboarding
 * shows the same one.
 */

/** The prototype's own hour buckets (its HomeGlassBar timeMessage). */
function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 9) return '좋은 아침이에요 ☀️';
  if (hour >= 9 && hour < 12) return '산책하기 좋은 오전이에요';
  if (hour >= 12 && hour < 14) return '좋은 점심이에요 🌿';
  if (hour >= 14 && hour < 18) return '좋은 오후예요';
  if (hour >= 18 && hour < 21) return '오늘 하루도 기록해볼까요?';
  return '오늘 하루 어떠셨나요? 🌙';
}

function clockFor(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The prototype's detection CTA, bound to real state instead of its hardcoded
 * "43분 · 망원동 · 오후 3:42".
 *
 * `/walk` re-resolves everything on entry and bounces stale taps home, so this
 * is a shortcut to it, never an authority on it.
 *
 * There is no location: the detector reports none (locationSummary is always
 * null), so the prototype's 망원동 has no real counterpart.
 */
function PendingCard({ detection }: { detection: DetectedWalk }) {
  const { scale, onPressIn, onPressOut } = usePressScale();

  const durationSeconds =
    detection.endedAtMs === null
      ? null
      : Math.round((detection.endedAtMs - detection.startedAtMs) / 1000);
  const summary = [
    ...(durationSeconds === null ? [] : [formatDurationMinutes(durationSeconds)]),
    formatTime(detection.startedAtMs),
  ].join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/walk')}
      onPressIn={onPressIn}
      onPressOut={onPressOut}>
      <Animated.View style={[{ transform: [{ scale }] }, shadows.ctaGlow]}>
        <View className="flex-row items-center gap-3 rounded-2xl bg-sage p-4">
          <View className="h-[42px] w-[42px] items-center justify-center rounded-full border-[1.5px] border-white/35 bg-white/25">
            <MowaFace size={30} />
          </View>
          <View className="flex-1">
            <Text className="mb-0.5 text-xs font-semibold tracking-wide text-white/75">
              {relativeLabel(detection.endedAtMs ?? detection.startedAtMs, Date.now())} 산책이
              감지되었어요
            </Text>
            <Text className="text-sm font-bold text-white">{summary}</Text>
          </View>
          <IcChevronRight size={16} color="rgba(255,255,255,0.6)" />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * What the section shows when nothing is waiting to be recorded.
 *
 * Deliberately not pressable: `/walk` re-resolves on entry and would bounce
 * straight back here, so a tap target would be a dead button.
 *
 * Same skeleton as PendingCard (42px face + two lines) so the area stays
 * recognisable across states, but in the quiet palette and with no glow — it
 * reports a state, it does not ask to be tapped.
 */
function IdleCard() {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-parchment p-4">
      <View className="h-[42px] w-[42px] items-center justify-center rounded-full border-[1.5px] border-line bg-white">
        <MowaFace size={30} />
      </View>
      <View className="flex-1">
        <Text className="mb-0.5 text-sm font-semibold text-ink">아직 감지된 산책이 없어요</Text>
        <Text className="text-xs text-ink-muted">걷고 나면 알려드릴게요</Text>
      </View>
    </View>
  );
}

/**
 * 산책 기록 알림. The section itself always renders; only the card inside it
 * branches.
 *
 * The prototype's card is hardcoded and therefore always visible, while this
 * one is bound to a real detection — so before the idle state existed the whole
 * area vanished whenever nothing was pending, which on web (no detector, so
 * `lastDetection` never leaves null) meant it never appeared at all.
 *
 * A pending card needs all three: the server knows the candidate, the user has
 * not skipped it, and its diary is not already saved. The four ways that can
 * fail collapse into one idle state on purpose — from the user's side they all
 * mean "nothing to record right now", and splitting them would multiply
 * team-owned copy for no gain.
 */
function DetectionSection() {
  const detection = useWalkCandidateFlow((state) => state.lastDetection);
  const active = useWalkCandidateFlow((state) => state.activeCandidate);
  const flowWalk = useDiaryFlow((state) => state.walk);
  const flowExperienceId = useDiaryFlow((state) => state.experienceId);

  const pending = ((): DetectedWalk | null => {
    if (detection === null || detection.candidateId === null) return null;
    const skipped =
      active?.candidateId === detection.candidateId && active.serverStatus === 'SKIPPED';
    const alreadySaved =
      flowWalk?.candidateId === detection.candidateId && flowExperienceId !== null;
    return skipped || alreadySaved ? null : detection;
  })();

  return (
    <View className="mt-6 px-4">
      <Text className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        산책 기록 알림
      </Text>
      {pending === null ? <IdleCard /> : <PendingCard detection={pending} />}
    </View>
  );
}

function PhotoTile({ item }: { item: WalkExperienceListItem }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const { month, day } = kstPartsFromIso(item.startedAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/experiences/${item.experienceId}?from=home`)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}>
      {/* Animated.View carries style only — className on it is unverified on
          this stack, and a dropped class silently collapses the tile. */}
      <Animated.View style={{ transform: [{ scale }] }}>
        <View className="h-[148px] w-[148px] overflow-hidden rounded-[20px]">
          <WalkPhoto uri={item.photoUrl} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.58)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View className="absolute left-2.5 top-2.5 rounded-full bg-black/30 px-2 py-1">
            <Text className="text-[11px] font-semibold text-white">{`${month}월 ${day}일`}</Text>
          </View>
          <View className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            <Text numberOfLines={2} className="text-xs font-semibold leading-tight text-white">
              {item.title}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Soft card used for both the empty and the unreachable-server cases. */
function StripNotice({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mx-5 items-center rounded-2xl border border-line bg-parchment px-5 py-7">
      <Text className="text-sm font-semibold text-ink">{title}</Text>
      <Text className="mt-1.5 text-center text-xs leading-relaxed text-ink-muted">{detail}</Text>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          className="mt-3 rounded-lg bg-sage-pale px-4 py-2 active:opacity-70">
          <Text className="text-xs font-semibold text-sage-dark">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * 최근 산책 기억. The deployed web build has no API on purpose (the mock is
 * local-only), so the unreachable case is the judge's default view and gets
 * copy that reads as a state, not a crash.
 */
function RecentWalks() {
  const listPhase = useExperiences((state) => state.listPhase);
  const items = useExperiences((state) => state.items);
  const loadList = useExperiences((state) => state.loadList);

  const recent = useMemo(() => items.slice(0, 6), [items]);

  return (
    <View className="mt-7">
      <View className="mb-3 flex-row items-center justify-between px-5">
        <Text className="text-sm font-semibold text-ink">최근 산책 기억</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/archive')}
          className="active:opacity-70">
          <Text className="text-xs font-medium text-sage">전체 보기</Text>
        </Pressable>
      </View>

      {listPhase === 'error' ? (
        <StripNotice
          title="기록을 불러오지 못했어요"
          detail={'서버에 연결되지 않았어요.\n잠시 후 다시 시도해 주세요.'}
          actionLabel="다시 시도"
          onAction={() => void loadList()}
        />
      ) : recent.length === 0 && listPhase !== 'ready' ? (
        <View className="h-[148px] items-center justify-center">
          <ActivityIndicator color={colors.sage} />
        </View>
      ) : recent.length === 0 ? (
        <StripNotice
          title="아직 기록된 산책이 없어요"
          detail={'산책이 감지되면 알려드릴게요.\n그때 기억을 남겨보세요.'}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-5 pb-1">
          {recent.map((item) => (
            <PhotoTile key={item.experienceId} item={item} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function HomeGlassBar() {
  const [showTime, setShowTime] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const size = useAnimatedToggle(showTime, 200);

  // Ticking every second only matters while the clock is showing; otherwise the
  // greeting changes at most once an hour.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), showTime ? 1_000 : 60_000);
    return () => clearInterval(id);
  }, [showTime]);

  return (
    <GlassBarShell>
      <GlassCircleButton accessibilityLabel="설정" onPress={() => router.push('/settings')}>
        <IcUser size={22} color={colors.white} />
      </GlassCircleButton>

      <GlassPill>
        <View className="h-full flex-row items-center gap-3 pl-2 pr-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showTime ? '인사말 보기' : '현재 시각 보기'}
            onPress={() => setShowTime((value) => !value)}>
            <LinearGradient
              colors={['rgba(130,190,80,0.85)', 'rgba(70,120,35,0.75)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                height: 36,
                width: 36,
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.45)',
              }}
            />
          </Pressable>

          <Animated.Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.white,
              fontWeight: '600',
              letterSpacing: -0.2,
              fontSize: size.interpolate({ inputRange: [0, 1], outputRange: [13, 17] }),
            }}>
            {showTime ? clockFor(now) : greetingFor(now)}
          </Animated.Text>
        </View>
      </GlassPill>

      <GlassCircleButton accessibilityLabel="기록장" onPress={() => router.push('/archive')}>
        <IcDocument size={22} color={colors.white} />
      </GlassCircleButton>
    </GlassBarShell>
  );
}

export default function HomeScreen() {
  const loadList = useExperiences((state) => state.loadList);
  const signedIn = useAuth((state) => state.status === 'signed-in');

  // Refetched on every mount: the payload is small and the archive or a saved
  // diary can change it while this screen is out of view.
  //
  // Gated on the session, not just mount. On a reload this screen mounts while
  // the token is still being restored, and an ungated fetch would fire without
  // one and land on the error card. Keying the effect on `signedIn` also makes
  // it refetch after an account switch instead of showing the previous user's
  // rows.
  useEffect(() => {
    if (!signedIn) return;
    void loadList();
  }, [signedIn, loadList]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <ScrollView className="flex-1" contentContainerClassName="pb-32">
        <CharacterHero tagline="당신의 산책을 모와드릴까요?" />
        <DetectionSection />
        <RecentWalks />
      </ScrollView>
      <HomeGlassBar />
    </SafeAreaView>
  );
}
