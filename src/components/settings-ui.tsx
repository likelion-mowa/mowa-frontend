import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IcChevronRight } from '@/components/icons';
import { colors } from '@/lib/theme';

/**
 * The prototype's settings list vocabulary (App.tsx SettingsScreen and its two
 * sub-screens): an uppercase section label above a bordered card, rows of
 * `icon tile · title/subtitle · trailing control`.
 *
 * Shared because all three settings screens use the same shapes; keeping one
 * copy is what stops them drifting the way the prototype's own screens did.
 */

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-line bg-white">{children}</View>
    </View>
  );
}

type SettingsRowProps = {
  icon?: ReactNode;
  /** Tailwind class for the icon tile, e.g. `bg-sage-pale`. */
  tileClassName?: string;
  title: string;
  subtitle?: string;
  /** Trailing content: a Toggle, a status label, or nothing. */
  right?: ReactNode;
  onPress?: () => void;
  /** Draws the divider under this row. Omit on the last row of a card. */
  divider?: boolean;
  disabled?: boolean;
};

export function SettingsRow({
  icon,
  tileClassName = 'bg-sage-pale',
  title,
  subtitle,
  right,
  onPress,
  divider = false,
  disabled = false,
}: SettingsRowProps) {
  const body = (
    <View
      className={`flex-row items-center gap-3 px-4 py-4 ${divider ? 'border-b border-line' : ''}`}>
      {icon ? (
        <View className={`h-9 w-9 items-center justify-center rounded-xl ${tileClassName}`}>
          {icon}
        </View>
      ) : null}

      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-ink-muted">{subtitle}</Text> : null}
      </View>

      {right ?? (onPress ? <IcChevronRight size={14} color={colors.inkSubtle} /> : null)}
    </View>
  );

  if (onPress === undefined) return body;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`active:bg-parchment ${disabled ? 'opacity-50' : ''}`}>
      {body}
    </Pressable>
  );
}

/** Read-only `label — value` line, for facts the user cannot change. */
export function SettingsFact({
  label,
  value,
  divider = false,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3.5 ${divider ? 'border-b border-line' : ''}`}>
      <Text className="text-sm text-ink-muted">{label}</Text>
      <Text className="text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}
