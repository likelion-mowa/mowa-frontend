import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import type { WalkExperienceListItem } from '@/api/types';
import { GlassBarShell, GlassCircleButton, GlassPill } from '@/components/glass-bar';
import { IcChevronRight, IcDocument, IcUser } from '@/components/icons';
import { MowaFace } from '@/components/mowa-face';
import { WalkPhoto } from '@/components/walk-photo';
import { usePressScale, useAnimatedToggle } from '@/lib/animations';
import { formatDurationMinutes, formatTime, relativeLabel } from '@/lib/format';
import { kstPartsFromIso } from '@/lib/kst';
import { colors, shadows } from '@/lib/theme';
import { useDiaryFlow } from '@/stores/diary-flow-store';
import { useExperiences } from '@/stores/experience-store';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * Home (prototype HomeScreen, src/App.tsx 1118-1288) — the first screen of the
 * app and the one a hackathon judge opens on the deployed web URL. Developer
 * diagnostics stay on /debug.
 *
 * The prototype's character carries a CSS `drop-shadow`; that filter has no
 * portable RN equivalent (react-native-web maps shadow props to box-shadow,
 * which would draw the image's bounding box), so only the ground ellipse is
 * ported — it is what actually grounds the character.
 */

const CHARACTER = require('../../assets/images/mowa-character.png');

// Source is 880x1245; keep the ratio so the character never squashes.
const CHARACTER_WIDTH = 200;
const CHARACTER_HEIGHT = Math.round((CHARACTER_WIDTH * 1245) / 880);

const BUBBLE_HOLD_MS = 2000;
const BUBBLE_FADE_MS = 400;

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

function CharacterHero() {
  const [bubbleMounted, setBubbleMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    },
    [],
  );

  const showBubble = () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    setBubbleMounted(true);
    Animated.timing(opacity, {
      toValue: 1,
      duration: BUBBLE_FADE_MS,
      useNativeDriver: true,
    }).start();

    hideTimer.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: BUBBLE_FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setBubbleMounted(false);
      });
    }, BUBBLE_HOLD_MS);
  };

  return (
    <View className="items-center px-6 pb-2 pt-6">
      <View className="relative items-center">
        {bubbleMounted ? (
          <Animated.View style={{ position: 'absolute', top: 0, right: '52%', opacity, zIndex: 10 }}>
            <View className="rounded-xl bg-bubble px-3.5 py-2.5">
              <Text className="text-xs font-bold leading-5 text-bubble-ink">
                안녕하세요{'\n'}MOWA예요!
              </Text>
            </View>
            {/* Tail: a rotated square reads as a triangle once the bubble overlaps it. */}
            <View
              className="absolute h-3 w-3 bg-bubble"
              style={{ bottom: 4, right: -4, transform: [{ rotate: '45deg' }] }}
            />
          </Animated.View>
        ) : null}

        <Pressable
          accessibilityRole="image"
          accessibilityLabel="MOWA 캐릭터"
          onPress={showBubble}>
          <Image
            source={CHARACTER}
            style={{ width: CHARACTER_WIDTH, height: CHARACTER_HEIGHT }}
            resizeMode="contain"
          />
        </Pressable>

        <Svg width={100} height={14} style={{ marginTop: -10 }}>
          <Defs>
            <RadialGradient id="groundShadow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#000000" stopOpacity={0.12} />
              <Stop offset="55%" stopColor="#000000" stopOpacity={0.03} />
              <Stop offset="80%" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={50} cy={7} rx={50} ry={7} fill="url(#groundShadow)" />
        </Svg>
      </View>

      <Text
        className="mt-1 text-center font-extrabold text-sage-lime"
        style={{ fontSize: 36, letterSpacing: -0.7 }}>
        MOWA
      </Text>
      <Text className="mt-1.5 text-center text-sm font-medium text-ink-muted">
        당신의 산책을 모와드릴까요?
      </Text>
    </View>
  );
}

/**
 * The prototype's detection CTA, bound to real state instead of its hardcoded
 * "43분 · 망원동 · 오후 3:42".
 *
 * It appears only while this session's detection is still worth acting on: the
 * server has to know the candidate, the user must not have skipped it, and the
 * diary for that same candidate must not already be saved. `/walk` re-resolves
 * everything on entry and bounces stale taps home, so this is a shortcut to it,
 * never an authority on it.
 *
 * There is no location: the detector reports none (locationSummary is always
 * null), so the prototype's 망원동 has no real counterpart.
 */
function DetectionCard() {
  const detection = useWalkCandidateFlow((state) => state.lastDetection);
  const active = useWalkCandidateFlow((state) => state.activeCandidate);
  const flowWalk = useDiaryFlow((state) => state.walk);
  const flowExperienceId = useDiaryFlow((state) => state.experienceId);
  const { scale, onPressIn, onPressOut } = usePressScale();

  if (detection === null || detection.candidateId === null) return null;

  const skipped =
    active?.candidateId === detection.candidateId && active.serverStatus === 'SKIPPED';
  const alreadySaved =
    flowWalk?.candidateId === detection.candidateId && flowExperienceId !== null;
  if (skipped || alreadySaved) return null;

  const durationSeconds =
    detection.endedAtMs === null
      ? null
      : Math.round((detection.endedAtMs - detection.startedAtMs) / 1000);
  const summary = [
    ...(durationSeconds === null ? [] : [formatDurationMinutes(durationSeconds)]),
    formatTime(detection.startedAtMs),
  ].join(' · ');

  return (
    <View className="mt-6 px-4">
      <Text className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        산책 기록 알림
      </Text>
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

  // Refetched on every mount: the payload is small and the archive or a saved
  // diary can change it while this screen is out of view.
  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <ScrollView className="flex-1" contentContainerClassName="pb-32">
        <CharacterHero />
        <DetectionCard />
        <RecentWalks />
      </ScrollView>
      <HomeGlassBar />
    </SafeAreaView>
  );
}
