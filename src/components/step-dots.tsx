import { Animated, View } from 'react-native';

import { useAnimatedToggle } from '@/lib/animations';
import { colors } from '@/lib/theme';

/**
 * The prototype's step rail: the active dot widens 6→20 and reached dots turn
 * sage, both over 300ms (duration-300).
 *
 * Lifted out of `src/app/diary/context.tsx` when the permission gate needed the
 * same rail. `/diary/photo`'s two-pip rail is deliberately not folded in here —
 * it is a different shape, not the same component at a smaller count.
 */

function StepDot({ reached, active }: { reached: boolean; active: boolean }) {
  const activeAnim = useAnimatedToggle(active, 300);
  const reachedAnim = useAnimatedToggle(reached, 300);
  return (
    <Animated.View
      style={{
        height: 6,
        borderRadius: 999,
        marginHorizontal: 2,
        width: activeAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 20] }),
        backgroundColor: reachedAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [colors.line, colors.sage],
        }),
      }}
    />
  );
}

/** `current` is 1-based, matching the "{current} / {total}" counter next to it. */
export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View className="flex-row items-center">
      {Array.from({ length: total }, (_, index) => index + 1).map((dot) => (
        <StepDot key={dot} reached={dot <= current} active={dot === current} />
      ))}
    </View>
  );
}
