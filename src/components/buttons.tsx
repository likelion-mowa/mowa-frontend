import { Animated, Pressable, Text, View } from 'react-native';

import { usePressScale } from '@/lib/animations';
import { colors, shadows } from '@/lib/theme';

/**
 * The prototype's two button styles, used on every diary-flow screen:
 * primary = solid sage, secondary = parchment with a border. Presses ease to
 * 0.97 and back (prototype `active:scale-[0.97]` + `duration-200`), via an
 * Animated scale inside the Pressable.
 */

/**
 * One radius per size, read by BOTH the rounded surface and the wrapper that
 * casts the glow. The two must not drift: react-native-web renders RN shadow
 * props as a CSS `box-shadow`, and a box-shadow follows the radius of the
 * element it sits on — not the radius of the rounded child inside it. With the
 * wrapper left square, web drew a rectangular green halo behind the round CTA
 * while iOS looked correct (measured 2026-08-18 on the deployed onboarding
 * screen: the shadow-carrying div reported `border-radius: 0px`). Same trap as
 * PR #19 on the glass bar.
 */
const RADIUS = { hero: 14, base: 12 } as const;

/**
 * The glow also needs an opaque, unclipped surface to come off — iOS draws no
 * shadow for a transparent view. So the wrapper repeats the sage fill that the
 * inner view paints over it, matching the home PendingCard (src/app/index.tsx).
 */
const glowSurface = { ...shadows.ctaGlow, backgroundColor: colors.sage } as const;

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The prototype's green glow shadow — its big CTAs carry it, small ones don't. */
  glow?: boolean;
  /** Extra classes for layout (flex-1, margins); visuals stay in here. */
  className?: string;
};

type PrimaryButtonProps = ButtonProps & {
  /**
   * Onboarding's single full-width CTA: 17px label, 15px padding, radius 14
   * (prototype OnboardingScreen). Everywhere else keeps the smaller default.
   */
  hero?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  glow = false,
  hero = false,
  className = '',
}: PrimaryButtonProps) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const borderRadius = hero ? RADIUS.hero : RADIUS.base;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className={`${disabled ? 'opacity-50' : ''} ${className}`}>
      <Animated.View
        style={[
          { transform: [{ scale }], borderRadius },
          glow && !disabled ? glowSurface : null,
        ]}>
        <View
          className="bg-sage px-4"
          style={{ borderRadius, paddingVertical: hero ? 15 : 14 }}>
          <Text
            className="text-center font-semibold text-white"
            style={{ fontSize: hero ? 17 : 14 }}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false, className = '' }: ButtonProps) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className={`${disabled ? 'opacity-50' : ''} ${className}`}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View className="rounded-xl border border-line bg-parchment-dark px-4 py-3.5">
          <Text className="text-center text-sm font-medium text-ink-muted">{label}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
