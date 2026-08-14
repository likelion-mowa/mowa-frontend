import { Animated, Pressable, Text, View } from 'react-native';

import { usePressScale } from '@/lib/animations';
import { shadows } from '@/lib/theme';

/**
 * The prototype's two button styles, used on every diary-flow screen:
 * primary = solid sage, secondary = parchment with a border. Presses ease to
 * 0.97 and back (prototype `active:scale-[0.97]` + `duration-200`), via an
 * Animated scale inside the Pressable.
 */

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
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className={`${disabled ? 'opacity-50' : ''} ${className}`}>
      <Animated.View style={[{ transform: [{ scale }] }, glow && !disabled ? shadows.ctaGlow : null]}>
        <View
          className="bg-sage px-4"
          style={hero ? { borderRadius: 14, paddingVertical: 15 } : { borderRadius: 12, paddingVertical: 14 }}>
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
