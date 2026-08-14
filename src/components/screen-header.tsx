import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IcChevronLeft } from '@/components/icons';
import { colors } from '@/lib/theme';

/**
 * The prototype's flow header: back chevron on the left, an optional centered
 * title, and a right spacer that keeps the title truly centered.
 */
export function ScreenHeader({
  title,
  onBack,
  center,
}: {
  title?: string;
  onBack: () => void;
  /** Replaces the title with arbitrary content (the step-dots rail). */
  center?: ReactNode;
}) {
  return (
    <View className="flex-row items-center px-3 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로"
        onPress={onBack}
        className="p-2 active:opacity-70"
        hitSlop={8}>
        <IcChevronLeft size={22} color={colors.inkMuted} />
      </Pressable>
      <View className="flex-1 items-center">
        {center ?? (title !== undefined ? (
          <Text className="text-sm font-semibold text-ink">{title}</Text>
        ) : null)}
      </View>
      <View className="w-10" />
    </View>
  );
}
