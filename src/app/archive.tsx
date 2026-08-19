import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import type { WalkExperienceListItem } from '@/api/types';
import { GlassBarShell, GlassCircleButton, GlassPill } from '@/components/glass-bar';
import { IcCalendar, IcChevronLeft, IcChevronRight, IcGrid, IcHome } from '@/components/icons';
import { MowaFace } from '@/components/mowa-face';
import { WalkPhoto } from '@/components/walk-photo';
import { usePressScale } from '@/lib/animations';
import { formatDurationMinutes } from '@/lib/format';
import {
  daysInMonth,
  firstWeekdayOfMonth,
  kstNow,
  kstPartsFromIso,
  shiftMonth,
  type KstParts,
} from '@/lib/kst';
import { colors, shadows } from '@/lib/theme';
import { useExperiences } from '@/stores/experience-store';
import { useAuth } from '@/stores/auth-store';

/**
 * 기록장 — the archive (prototype ArchiveScreen, src/App.tsx 1829-1968).
 *
 * Two views over the same list: a photo grid and a calendar. Grouping runs in
 * Asia/Seoul (src/lib/kst.ts) so a walk lands on the same day the server would
 * put it on.
 *
 * The 년/월/전체 tabs GROUP the grid, they do not filter it — every tab shows
 * every saved walk. What changes is the bucket size, and with it how much of
 * the date a tile has to spell out: the tile says exactly what the header above
 * it does not. 전체 has no header at all, so its tiles carry the year.
 *
 * Deliberate reading of the prototype, flagged in the PR:
 * - the calendar's own month navigation is its period control, so it always
 *   reads the full list and ignores the tabs;
 * - the stats count every walk (the prototype does the same);
 * - the prototype keeps one walk per calendar day and silently drops the rest.
 *   Here the cell shows the latest walk of the day with a count badge, and the
 *   list under the calendar shows every one of them.
 */

type ViewMode = 'grid' | 'calendar';
/** What the grid is bucketed by. Also decides how much date a tile writes. */
type GroupMode = 'year' | 'month' | 'all';

const GROUP_MODES: { label: string; value: GroupMode }[] = [
  { label: '년', value: 'year' },
  { label: '월', value: 'month' },
  { label: '전체', value: 'all' },
];

/** 전체 drops every walk in one bucket, and draws no header above it. */
function groupKeyOf(parts: KstParts, mode: GroupMode): string {
  switch (mode) {
    case 'year':
      return `${parts.year}`;
    case 'month':
      return `${parts.year}-${parts.month}`;
    case 'all':
      return 'all';
  }
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const GRID_GAP = 2;
const GRID_COLUMNS = 3;

function openDetail(experienceId: string) {
  router.push(`/experiences/${experienceId}?from=archive`);
}

/**
 * 누적 시간 needs a duration per row and the list response carries none yet
 * (docs/api-implementation.md 공백 8). Summing only when every row has one
 * keeps the number honest and lights it up by itself once the field ships.
 *
 * Minutes, not hours: a walk is a half-hour thing, so an archive with a few of
 * them read `0.6시간` — a unit the reader has to convert back before it means
 * anything. Every other duration on this screen is already in minutes (the
 * calendar cells and the month list both call formatDurationMinutes), so the
 * stat now matches the numbers sitting next to it.
 *
 * Not formatDurationMinutes itself: its `Math.max(1, …)` floor exists so one
 * short walk never reads 0분, and applying that to a SUM would make a loaded
 * archive of zero-length walks claim 1분.
 */
function totalMinutesLabel(items: WalkExperienceListItem[]): string {
  if (items.length === 0) return '0분';
  const seconds = items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  const complete = items.every((item) => item.durationSeconds != null);
  return complete ? `${Math.round(seconds / 60)}분` : '—';
}

/**
 * The tabs only group now, so the one thing left that still compares a walk
 * against today is the 이번 달 stat.
 */
function isThisMonth(item: WalkExperienceListItem, today: KstParts): boolean {
  const parts = kstPartsFromIso(item.startedAt);
  return parts.year === today.year && parts.month === today.month;
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-base font-bold leading-none text-sage">{value}</Text>
      <Text className="mt-1 text-[10px] font-medium text-ink-subtle">{label}</Text>
    </View>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (next: ViewMode) => void }) {
  const segments: { value: ViewMode; label: string; icon: (color: string) => React.ReactNode }[] = [
    { value: 'grid', label: '사진 그리드', icon: (color) => <IcGrid size={14} color={color} /> },
    { value: 'calendar', label: '캘린더', icon: (color) => <IcCalendar size={14} color={color} /> },
  ];

  return (
    <View className="flex-row gap-2 rounded-xl bg-parchment-mid p-1">
      {segments.map((segment) => {
        const active = segment.value === mode;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(segment.value)}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${
              active ? 'bg-white' : ''
            }`}
            style={active ? shadows.card : undefined}>
            {segment.icon(active ? colors.ink : colors.inkSubtle)}
            <Text className={`text-xs font-semibold ${active ? 'text-ink' : 'text-ink-subtle'}`}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Photo grid
// -----------------------------------------------------------------------------

/**
 * `'all'` is excluded from the prop rather than handled inside: that mode draws
 * no header, and making it unrepresentable means a stray label cell fails to
 * compile instead of appearing on screen.
 */
function GroupLabelCell({
  size,
  parts,
  mode,
}: {
  size: number;
  parts: KstParts;
  mode: Exclude<GroupMode, 'all'>;
}) {
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center bg-mint-pale">
      {mode === 'month' ? (
        <>
          <Text className="text-[11px] font-semibold tracking-wider text-sage">{parts.year}</Text>
          <Text className="text-[24px] font-bold leading-none text-ink">{`${parts.month}월`}</Text>
        </>
      ) : (
        <Text className="text-[24px] font-bold leading-none text-ink">{`${parts.year}년`}</Text>
      )}
    </View>
  );
}

function GridTile({
  size,
  item,
  mode,
}: {
  size: number;
  item: WalkExperienceListItem;
  mode: GroupMode;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const { year, month, day } = kstPartsFromIso(item.startedAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => openDetail(item.experienceId)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={{ width: size, height: size }} className="overflow-hidden">
          <WalkPhoto uri={item.photoUrl} iconSize={18} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.6)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View className="absolute bottom-0 left-0 px-2 pb-2">
            {/* 전체 has no group header, so the tile owns the year. Same rhythm
                GroupLabelCell uses — small year over the big date — which keeps
                the large line in the same place across all three tabs. */}
            {mode === 'all' ? (
              <Text className="text-[11px] font-semibold tracking-wider text-white/70">
                {year}
              </Text>
            ) : null}
            <Text className="text-[18px] font-bold text-white">
              {mode === 'month' ? `${day}일` : `${month}월 ${day}일`}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The width a cell grid actually gets, measured instead of assumed.
 *
 * `useWindowDimensions()` stood in for this, which held only while the app
 * filled the window. The web shell now caps the app at a phone-sized column
 * (src/app/+html.tsx), so the window is wider than the content and a
 * window-derived cell is too wide to fit its own row — the photo grid dropped
 * to two columns and left the third's worth of space empty.
 *
 * Measuring keeps that width in exactly one place, the CSS that sets it. Doing
 * the arithmetic against a copied `430` here would be a second source of truth
 * that only shows up as a silently wrong column count.
 *
 * On iOS the container IS the window, so this measures what it always did.
 */
function useMeasuredWidth(): readonly [number, (event: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return [width, onLayout] as const;
}

function PhotoGrid({ items, mode }: { items: WalkExperienceListItem[]; mode: GroupMode }) {
  const [width, onLayout] = useMeasuredWidth();
  const size = (width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  // Rows arrive sorted startedAt DESC, so first-seen group order is newest
  // first and each group keeps that order.
  const groups = useMemo(() => {
    const out: { key: string; parts: KstParts; items: WalkExperienceListItem[] }[] = [];
    for (const item of items) {
      const parts = kstPartsFromIso(item.startedAt);
      const key = groupKeyOf(parts, mode);
      const group = out.find((candidate) => candidate.key === key);
      // `parts` belongs to the group's FIRST row. Year mode reads only `.year`
      // from it, and 전체 reads nothing — it draws no header.
      if (group === undefined) out.push({ key, parts, items: [item] });
      else group.items.push(item);
    }
    return out;
  }, [items, mode]);

  return (
    // Nothing is drawn until the first layout reports a width — one frame, and
    // the alternative is a flash of zero-sized tiles.
    <View onLayout={onLayout}>
      {width > 0
        ? groups.map((group) => (
            <View key={group.key} className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
              {mode === 'all' ? null : (
                <GroupLabelCell size={size} parts={group.parts} mode={mode} />
              )}
              {group.items.map((item) => (
                <GridTile key={item.experienceId} size={size} item={item} mode={mode} />
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Calendar
// -----------------------------------------------------------------------------

function CalendarDayCell({
  size,
  day,
  walks,
}: {
  size: number;
  day: number;
  walks: WalkExperienceListItem[];
}) {
  const latest = walks[0];
  const minutes = latest?.durationSeconds;

  if (latest === undefined) {
    return (
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Text className="text-xs font-bold leading-none text-ink-subtle">{day}</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${day}일 ${latest.title}`}
      onPress={() => openDetail(latest.experienceId)}>
      <View
        style={{ width: size, height: size }}
        className="items-center justify-center overflow-hidden rounded-xl">
        <LinearGradient
          colors={[colors.sage, colors.sageDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <WalkPhoto uri={latest.photoUrl} opacity={0.6} showFallback={false} />
        <Text className="z-10 text-xs font-bold leading-none text-white">{day}</Text>
        {minutes != null ? (
          <Text className="z-10 mt-0.5 text-[7px] font-medium text-white/80">
            {formatDurationMinutes(minutes)}
          </Text>
        ) : null}
        {walks.length > 1 ? (
          <View className="absolute right-1 top-1 h-3.5 w-3.5 items-center justify-center rounded-full bg-white/85">
            <Text className="text-[8px] font-bold text-sage-dark">{walks.length}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function MonthListRow({ item }: { item: WalkExperienceListItem }) {
  const { day } = kstPartsFromIso(item.startedAt);
  const meta = [
    `${day}일`,
    ...(item.durationSeconds == null ? [] : [formatDurationMinutes(item.durationSeconds)]),
    ...(item.locationSummary === null ? [] : [item.locationSummary]),
  ].join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openDetail(item.experienceId)}
      className="mb-2 flex-row items-center gap-3 rounded-xl border border-line bg-white p-3 active:opacity-80">
      <View className="h-10 w-10 overflow-hidden rounded-lg">
        <WalkPhoto uri={item.photoUrl} iconSize={16} />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-ink">
          {item.title}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted">{meta}</Text>
      </View>
    </Pressable>
  );
}

function CalendarView({ items }: { items: WalkExperienceListItem[] }) {
  // Measured inside this screen's horizontal padding, which is why there is no
  // padding constant to subtract here any more.
  const [width, onLayout] = useMeasuredWidth();
  const cell = width / 7;
  const [view, setView] = useState(() => {
    const now = kstNow(Date.now());
    return { year: now.year, month: now.month };
  });

  // Items are startedAt DESC, so index 0 of each day is that day's latest walk.
  const { byDay, monthItems } = useMemo(() => {
    const map = new Map<number, WalkExperienceListItem[]>();
    const inMonth: WalkExperienceListItem[] = [];
    for (const item of items) {
      const parts = kstPartsFromIso(item.startedAt);
      if (parts.year !== view.year || parts.month !== view.month) continue;
      inMonth.push(item);
      const existing = map.get(parts.day);
      if (existing === undefined) map.set(parts.day, [item]);
      else existing.push(item);
    }
    return { byDay: map, monthItems: inMonth };
  }, [items, view]);

  const leading = firstWeekdayOfMonth(view.year, view.month);
  const total = daysInMonth(view.year, view.month);

  return (
    <View className="px-4 py-3">
      <View className="mb-4 flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 달"
          onPress={() => setView((current) => shiftMonth(current.year, current.month, -1))}
          className="p-2 active:opacity-70">
          <IcChevronLeft size={18} color={colors.inkMuted} />
        </Pressable>
        <Text className="text-[15px] font-semibold text-ink">
          {`${view.year}년 ${view.month}월`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          onPress={() => setView((current) => shiftMonth(current.year, current.month, 1))}
          className="p-2 active:opacity-70">
          <IcChevronRight size={18} color={colors.inkMuted} />
        </Pressable>
      </View>

      <View onLayout={onLayout}>
        {width > 0 ? (
          <>
            <View className="mb-1 flex-row">
              {WEEKDAYS.map((label) => (
                <Text
                  key={label}
                  style={{ width: cell }}
                  className="py-1 text-center text-[10px] font-semibold text-ink-subtle">
                  {label}
                </Text>
              ))}
            </View>

            <View className="flex-row flex-wrap">
              {Array.from({ length: leading }, (_, index) => (
                <View key={`blank-${index}`} style={{ width: cell, height: cell }} />
              ))}
              {Array.from({ length: total }, (_, index) => index + 1).map((day) => (
                <View key={day} style={{ width: cell }} className="mb-1">
                  <CalendarDayCell size={cell} day={day} walks={byDay.get(day) ?? []} />
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View className="mt-4">
        {monthItems.length === 0 ? (
          <Text className="py-6 text-center text-sm text-ink-subtle">
            이달의 산책 기록이 없어요
          </Text>
        ) : (
          monthItems.map((item) => <MonthListRow key={item.experienceId} item={item} />)
        )}
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// States
// -----------------------------------------------------------------------------

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="mb-4 text-6xl">🌿</Text>
      <Text className="mb-2 text-center text-[17px] font-bold text-ink">산책 기록이 없어요</Text>
      {/* No filter left to change — every tab shows every walk, so reaching
          this screen means the archive is genuinely empty. */}
      <Text className="text-center text-sm leading-relaxed text-ink-muted">
        첫 산책을 기록해보세요.
      </Text>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="mb-2 text-center text-[17px] font-bold text-ink">
        기록을 불러오지 못했어요
      </Text>
      <Text className="text-center text-sm leading-relaxed text-ink-muted">
        서버에 연결되지 않았어요.{'\n'}잠시 후 다시 시도해 주세요.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-4 rounded-lg bg-sage-pale px-4 py-2 active:opacity-70">
        <Text className="text-xs font-semibold text-sage-dark">다시 시도</Text>
      </Pressable>
    </View>
  );
}

// -----------------------------------------------------------------------------

function GroupModeBar({
  mode,
  onChange,
}: {
  mode: GroupMode;
  onChange: (next: GroupMode) => void;
}) {
  return (
    <GlassBarShell>
      <GlassCircleButton accessibilityLabel="홈으로" onPress={() => router.replace('/')}>
        <IcChevronLeft size={22} color={colors.white} />
      </GlassCircleButton>

      <GlassPill>
        <View className="h-full flex-row items-center p-1">
          {GROUP_MODES.map((entry) => {
            const active = entry.value === mode;
            return (
              <Pressable
                key={entry.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onChange(entry.value)}
                className="h-full flex-1 items-center justify-center rounded-[22px]"
                style={active ? { backgroundColor: 'rgba(255,255,255,0.28)' } : undefined}>
                <Text style={{ color: colors.white, fontSize: 16, fontWeight: '700' }}>
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassPill>

      <GlassCircleButton accessibilityLabel="홈으로" onPress={() => router.replace('/')}>
        <IcHome size={22} color={colors.white} />
      </GlassCircleButton>
    </GlassBarShell>
  );
}

export default function ArchiveScreen() {
  const listPhase = useExperiences((state) => state.listPhase);
  const items = useExperiences((state) => state.items);
  const loadList = useExperiences((state) => state.loadList);
  // The auth store already holds the user from restore/sign-in, so the header
  // needs no fetch of its own. It stays null when /users/me was unreachable —
  // the title falls back to neutral copy rather than showing an error.
  const nickname = useAuth((state) => state.user?.nickname ?? null);
  const signedIn = useAuth((state) => state.status === 'signed-in');

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [groupMode, setGroupMode] = useState<GroupMode>('all');

  // Gated on the session: a reload mounts this screen while the token is still
  // being restored, and an ungated fetch would fire without one.
  useEffect(() => {
    if (!signedIn) return;
    void loadList();
  }, [signedIn, loadList]);

  const today = useMemo(() => kstNow(Date.now()), []);
  const thisMonthCount = useMemo(
    () => items.filter((item) => isThisMonth(item, today)).length,
    [items, today],
  );

  const loading = listPhase !== 'ready' && listPhase !== 'error' && items.length === 0;
  const unknown = listPhase === 'error';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="border-b border-line px-5 pb-4 pt-1">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="w-10" />
          <Text className="text-[20px] font-bold text-ink">기록장</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="설정"
            onPress={() => router.push('/settings')}
            className="h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-sage/25 bg-sage/10 active:opacity-70">
            <MowaFace size={26} />
          </Pressable>
        </View>

        <View className="mb-4 flex-row items-center gap-3 pl-2">
          <View className="h-12 w-12 items-center justify-center rounded-full border-2 border-sage bg-sage-pale">
            <Text className="text-[22px]">🌿</Text>
          </View>
          <View>
            {/* Falls back when /users/me has not answered — the archive is not
                worth blocking on a nickname. */}
            <Text className="text-[15px] font-semibold text-ink">
              {nickname === null ? '나의 기록장' : `${nickname}님의 기록장`}
            </Text>
            <Text className="text-xs text-ink-muted">산책 기억 모음</Text>
          </View>
        </View>

        {/* A failed load knows nothing, so it says nothing: zeros here would
            read as "you have never walked". */}
        <View className="mb-4 flex-row">
          <Stat value={unknown ? '—' : `${items.length}회`} label="누적 산책" />
          <View className="w-px bg-line" />
          <Stat value={unknown ? '—' : `${thisMonthCount}회`} label="이번 달" />
          <View className="w-px bg-line" />
          <Stat value={unknown ? '—' : totalMinutesLabel(items)} label="누적 시간" />
        </View>

        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </View>

      <View className="flex-1 bg-parchment">
        <ScrollView className="flex-1" contentContainerClassName="pb-32">
          {listPhase === 'error' ? (
            <ErrorState onRetry={() => void loadList()} />
          ) : loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.sage} />
            </View>
          ) : viewMode === 'calendar' ? (
            <CalendarView items={items} />
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <PhotoGrid items={items} mode={groupMode} />
          )}
        </ScrollView>
      </View>

      <GroupModeBar
        mode={groupMode}
        onChange={(next) => {
          setGroupMode(next);
          // The tabs group the grid; the calendar navigates by month instead.
          // Switching here keeps the control from doing nothing visible.
          setViewMode('grid');
        }}
      />
    </SafeAreaView>
  );
}
