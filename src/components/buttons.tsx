import { Pressable, Text } from 'react-native';

/**
 * The prototype's two button styles, used on every diary-flow screen:
 * primary = solid sage, secondary = parchment with a border.
 */

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Extra classes for layout (flex-1, margins); visuals stay in here. */
  className?: string;
};

export function PrimaryButton({ label, onPress, disabled = false, className = '' }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-xl bg-sage px-4 py-3.5 active:opacity-70 ${disabled ? 'opacity-50' : ''} ${className}`}>
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
      className={`rounded-xl border border-line bg-parchment-dark px-4 py-3.5 active:opacity-70 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <Text className="text-center text-sm font-medium text-ink-muted">{label}</Text>
    </Pressable>
  );
}
