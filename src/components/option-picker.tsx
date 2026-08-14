import { Animated, Pressable, Text, View } from 'react-native';

import type { Companion, Emotion, Situation } from '@/api/types';
import { useAnimatedToggle, usePressScale } from '@/lib/animations';
import { colors } from '@/lib/theme';

/**
 * The companion / emotion / situation pickers, shared by the diary flow that
 * CREATES an experience (`/diary/context`) and the editor that UPDATES one
 * (기능 8). Moved here verbatim from the flow screen — a second copy of ~160
 * lines of animated selection UI would drift the moment either side is touched.
 *
 * Single- versus multi-select is decided entirely by the `isSelected`/`onToggle`
 * callbacks the caller passes, so neither consumer needs a mode flag: companion
 * and situation compare against one value and clear on re-tap, emotions test
 * membership in an array.
 *
 * Codes and labels are NOT defined here — they come from `@/api/types`, the
 * spec's own vocabulary. Only the emoji are ours, ported from the prototype.
 *
 * Motion mirrors the prototype's CSS transitions via RN Animated: selection
 * eases over ~220ms. `Animated.View` carries `style` only — className on it is
 * unverified on this stack, and a dropped class silently collapses the tile.
 */

export const COMPANION_EMOJI: Record<Companion, string> = {
  ALONE: '🧘',
  WITH_SOMEONE: '👫',
  PET: '🐾',
};

export const EMOTION_EMOJI: Record<Emotion, string> = {
  CALM: '😌',
  HAPPY: '😊',
  TIRED: '😮‍💨',
  REFRESHED: '🌿',
  PENSIVE: '🤔',
};

export const SITUATION_EMOJI: Record<Situation, string> = {
  MORNING: '🌅',
  AFTERNOON: '☀️',
  EVENING: '🌆',
  IN_TRANSIT: '🚶',
  EXPLORING: '🗺️',
};

/** Selection colors easing between the unselected and sage states. */
function useSelectColors(selected: boolean) {
  const anim = useAnimatedToggle(selected, 220);
  return {
    backgroundColor: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.white, colors.sage],
    }),
    borderColor: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.line, colors.sage],
    }),
    labelColor: anim.interpolate({ inputRange: [0, 1], outputRange: [colors.ink, colors.white] }),
    checkOpacity: anim,
  };
}

export function WideOption({
  emoji,
  label,
  selected,
  onPress,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const sel = useSelectColors(selected);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className="mb-3">
      {/* Scale on the native driver, colors on the JS driver — separate views. */}
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View
          style={{
            backgroundColor: sel.backgroundColor,
            borderColor: sel.borderColor,
            borderWidth: 2,
            borderRadius: 16,
          }}>
          <View className="flex-row items-center px-5 py-4">
            <Text className="text-3xl">{emoji}</Text>
            <Animated.Text
              style={{ marginLeft: 16, fontSize: 17, fontWeight: '600', color: sel.labelColor }}>
              {label}
            </Animated.Text>
            <View className="flex-1" />
            <Animated.Text style={{ fontSize: 18, color: colors.white, opacity: sel.checkOpacity }}>
              ✓
            </Animated.Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function GridOption({
  emoji,
  label,
  selected,
  onPress,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const sel = useSelectColors(selected);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className="mb-3 w-[48%]">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View
          style={{
            backgroundColor: sel.backgroundColor,
            borderColor: sel.borderColor,
            borderWidth: 2,
            borderRadius: 16,
          }}>
          <View className="items-center py-6">
            <Text className="text-3xl">{emoji}</Text>
            <Animated.Text
              style={{ marginTop: 8, fontSize: 15, fontWeight: '600', color: sel.labelColor }}>
              {label}
            </Animated.Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function OptionGridRows<T extends string>({
  codes,
  emoji,
  labels,
  isSelected,
  onToggle,
}: {
  codes: readonly T[];
  emoji: Record<T, string>;
  labels: Record<T, string>;
  isSelected: (code: T) => boolean;
  onToggle: (code: T) => void;
}) {
  const rows: T[][] = [];
  for (let i = 0; i < codes.length; i += 2) rows.push(codes.slice(i, i + 2) as T[]);
  return (
    <View>
      {rows.map((row, index) => (
        // A lone last option sits centered — the prototype spans it across
        // both columns (gridColumn '1 / -1', margin auto) at half width.
        <View
          key={index}
          className={`flex-row ${row.length === 1 ? 'justify-center' : 'justify-between'}`}>
          {row.map((code) => (
            <GridOption
              key={code}
              emoji={emoji[code]}
              label={labels[code]}
              selected={isSelected(code)}
              onPress={() => onToggle(code)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
