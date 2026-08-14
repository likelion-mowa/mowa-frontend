import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
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
import { useProfile } from '@/stores/profile-store';

/**
 * 기록장 — the archive (prototype ArchiveScreen, src/App.tsx 1829-1968).
 *
 * Two views over the same list: a photo grid grouped by month and a calendar.
 * Grouping and filtering run in Asia/Seoul (src/lib/kst.ts) so a walk lands on
 * the same day the server would put it on.
 *
 * Deliberate reading of the prototype, flagged in the PR:
 * - the period tabs filter the grid; the calendar's own month navigation is
 *   its period control, so it always reads the full list;
 * - the stats count every walk, not the filtered subset (the prototype does
 *   the same);
 * - the prototype keeps one walk per calendar day and silently drops the rest.
 *   Here the cell shows the latest walk of the day with a count badge, and the
 *   list under the calendar shows every one of them.
 */

type ViewMode = 'grid' | 'calendar';
type PeriodFilter = 'year' | 'month' | 'all';

const PERIODS: { label: string; value: PeriodFilter }[] = [
  { label: '년', value: 'year' },
  { label: '월', value: 'month' },
  { label: '전체', value: 'all' },
];

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
 */
function totalHoursLabel(items: WalkExperienceListItem[]): string {
  if (items.length === 0) return '0시간';
  const seconds = items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  const complete = items.every((item) => item.durationSeconds != null);
  return complete ? `${(seconds / 3600).toFixed(1)}시간` : '—';
}

function inPeriod(item: WalkExperienceListItem, period: PeriodFilter, today: KstParts): boolean {
  if (period === 'all') return true;
  const parts = kstPartsFromIso(item.startedAt);
  if (parts.year !== today.year) return false;
  return period === 'year' || parts.month === today.month;
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

function MonthLabelCell({ size, parts }: { size: number; parts: KstParts }) {
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center bg-mint-pale">
      <Text className="text-[11px] font-semibold tracking-wider text-sage">{parts.year}</Text>
      <Text className="text-[24px] font-bold leading-none text-ink">{`${parts.month}월`}</Text>
    </View>
  );
}

function GridTile({ size, item }: { size: number; item: WalkExperienceListItem }) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const { day } = kstPartsFromIso(item.startedAt);

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
            <Text className="text-[18px] font-bold text-white">{`${day}일`}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function PhotoGrid({ items }: { items: WalkExperienceListItem[] }) {
  const { width } = useWindowDimensions();
  const size = (width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  // Rows arrive sorted startedAt DESC, so first-seen month order is newest
  // first and each group keeps that order.
  const months = useMemo(() => {
    const groups: { key: string; parts: KstParts; items: WalkExperienceListItem[] }[] = [];
    for (const item of items) {
      const parts = kstPartsFromIso(item.startedAt);
      const key = `${parts.year}-${parts.month}`;
      const group = groups.find((candidate) => candidate.key === key);
      if (group === undefined) groups.push({ key, parts, items: [item] });
      else group.items.push(item);
    }
    return groups;
  }, [items]);

  return (
    <View>
      {months.map((month) => (
        <View key={month.key} className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
          <MonthLabelCell size={size} parts={month.parts} />
          {month.items.map((item) => (
            <GridTile key={item.experienceId} size={size} item={item} />
          ))}
        </View>
      ))}
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
  const { width } = useWindowDimensions();
  const cell = (width - 32) / 7;
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
      <Text className="text-center text-sm leading-relaxed text-ink-muted">
        필터를 변경하거나{'\n'}첫 산책을 기록해보세요.
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

function PeriodFilterBar({
  period,
  onChange,
}: {
  period: PeriodFilter;
  onChange: (next: PeriodFilter) => void;
}) {
  return (
    <GlassBarShell>
      <GlassCircleButton accessibilityLabel="홈으로" onPress={() => router.replace('/')}>
        <IcChevronLeft size={22} color={colors.white} />
      </GlassCircleButton>

      <GlassPill>
        <View className="h-full flex-row items-center p-1">
          {PERIODS.map((entry) => {
            const active = entry.value === period;
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
  const nickname = useProfile((state) => state.nickname);
  const loadProfile = useProfile((state) => state.loadProfile);

  const [mode, setMode] = useState<ViewMode>('grid');
  const [period, setPeriod] = useState<PeriodFilter>('all');

  useEffect(() => {
    void loadList();
    void loadProfile();
  }, [loadList, loadProfile]);

  const today = useMemo(() => kstNow(Date.now()), []);
  const filtered = useMemo(
    () => items.filter((item) => inPeriod(item, period, today)),
    [items, period, today],
  );
  const thisMonthCount = useMemo(
    () => items.filter((item) => inPeriod(item, 'month', today)).length,
    [items, today],
  );

  const loading = listPhase !== 'ready' && listPhase !== 'error' && items.length === 0;

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

        <View className="mb-4 flex-row">
          <Stat value={`${items.length}회`} label="누적 산책" />
          <View className="w-px bg-line" />
          <Stat value={`${thisMonthCount}회`} label="이번 달" />
          <View className="w-px bg-line" />
          <Stat value={totalHoursLabel(items)} label="누적 시간" />
        </View>

        <ViewToggle mode={mode} onChange={setMode} />
      </View>

      <View className="flex-1 bg-parchment">
        <ScrollView className="flex-1" contentContainerClassName="pb-32">
          {listPhase === 'error' ? (
            <ErrorState onRetry={() => void loadList()} />
          ) : loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.sage} />
            </View>
          ) : mode === 'calendar' ? (
            <CalendarView items={items} />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <PhotoGrid items={filtered} />
          )}
        </ScrollView>
      </View>

      <PeriodFilterBar
        period={period}
        onChange={(next) => {
          setPeriod(next);
          // The tabs filter the grid; the calendar navigates by month instead.
          // Switching here keeps the control from doing nothing visible.
          setMode('grid');
        }}
      />
    </SafeAreaView>
  );
}
