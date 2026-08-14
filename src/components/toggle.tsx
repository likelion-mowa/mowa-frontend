import { Animated, Pressable } from 'react-native';

import { useAnimatedToggle } from '@/lib/animations';
import { colors } from '@/lib/theme';

/**
 * The prototype's switch (App.tsx Toggle): a 48×28 track that eases between
 * grey and sage, with a 20×20 knob sliding 4 → 24.
 *
 * Not RN's `Switch`: it cannot be sized to 48×28 or tinted sage on both
 * platforms, and it renders as a native checkbox-ish control on web.
 *
 * `Animated.View` silently ignores `className` (measured in PR #11 and again in
 * #12), so every animated value here goes through `style`.
 */

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const KNOB_SIZE = 20;
const DURATION_MS = 200;

type ToggleProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
};

export function Toggle({ value, onValueChange, disabled = false, accessibilityLabel }: ToggleProps) {
  const progress = useAnimatedToggle(value, DURATION_MS);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.toggleOff, colors.sage],
  });
  const left = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [4, TRACK_WIDTH - KNOB_SIZE - 4],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={{ opacity: disabled ? 0.4 : 1 }}>
      <Animated.View
        style={{
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor,
          justifyContent: 'center',
        }}>
        <Animated.View
          style={{
            position: 'absolute',
            left,
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: KNOB_SIZE / 2,
            backgroundColor: colors.white,
            shadowColor: '#000000',
            shadowOpacity: 0.2,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
