import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { GlassBarShell, GlassCircleButton, GlassPill } from '@/components/glass-bar';
import { IcCalendar, IcChevronLeft, IcGrid, IcHome } from '@/components/icons';
import { MowaFace } from '@/components/mowa-face';
import { colors, shadows } from '@/lib/theme';

/**
 * 기록장 — the archive (prototype ArchiveScreen, src/App.tsx 1829-1968).
 * Photo grid and calendar over the same list of walk experiences, with the
 * period filter living in the floating glass bar.
 */

type ViewMode = 'grid' | 'calendar';
type PeriodFilter = 'year' | 'month' | 'all';

const PERIODS: { label: string; value: PeriodFilter }[] = [
  { label: '년', value: 'year' },
  { label: '월', value: 'month' },
  { label: '전체', value: 'all' },
];

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
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
            <Text
              className={`text-xs font-semibold ${active ? 'text-ink' : 'text-ink-subtle'}`}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  const [mode, setMode] = useState<ViewMode>('grid');
  const [period, setPeriod] = useState<PeriodFilter>('all');

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

        <ViewToggle mode={mode} onChange={setMode} />
      </View>

      <View className="flex-1 bg-parchment">
        <ScrollView className="flex-1" contentContainerClassName="pb-32" />
      </View>

      <PeriodFilterBar period={period} onChange={setPeriod} />
    </SafeAreaView>
  );
}
