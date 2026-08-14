import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Labelled text input, matching the recipe already shipped on the diary edit
 * screen (rounded-xl / border-line / bg-white / px-4 py-3.5) so the two screens
 * do not drift.
 *
 * The focus ring is local state rather than NativeWind's `focus:` variant:
 * that variant is unverified on this stack, the same risk class as
 * `transition-*` and `animate-*` (AGENTS.md), and a silently-ignored class
 * would leave the field with no focus affordance at all.
 */

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  maxLength?: number;
  editable?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  className?: string;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = 'none',
  autoComplete,
  maxLength,
  editable = true,
  onSubmitEditing,
  returnKeyType,
  className = '',
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={className}>
      <Text className="mb-1.5 text-xs font-semibold text-ink-subtle">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        maxLength={maxLength}
        editable={editable}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        className={`rounded-xl border bg-white px-4 py-3.5 text-sm text-ink ${
          focused ? 'border-sage' : 'border-line'
        } ${editable ? '' : 'opacity-60'}`}
      />
    </View>
  );
}
