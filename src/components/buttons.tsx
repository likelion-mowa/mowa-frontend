import { Pressable, Text } from 'react-native';

import { shadows } from '@/lib/theme';

/**
 * The prototype's two button styles, used on every diary-flow screen:
 * primary = solid sage, secondary = parchment with a border. Presses scale to
 * 0.97 like the prototype's active:scale-[0.97] (RN pressed style, since
 * NativeWind's transition classes are unverified on this stack).
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

const pressedScale = ({ pressed }: { pressed: boolean }) =>
  pressed ? { transform: [{ scale: 0.97 }] } : undefined;

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  glow = false,
  className = '',
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={(state) => [glow && !disabled ? shadows.ctaGlow : null, pressedScale(state)]}
      className={`rounded-xl bg-sage px-4 py-3.5 active:opacity-80 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <Text className="text-center text-sm font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false, className = '' }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={pressedScale}
      className={`rounded-xl border border-line bg-parchment-dark px-4 py-3.5 active:opacity-80 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <Text className="text-center text-sm font-medium text-ink-muted">{label}</Text>
    </Pressable>
  );
}
