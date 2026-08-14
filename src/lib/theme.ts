/**
 * Prototype palette as JS values, for the places className cannot reach —
 * react-native-svg stroke/fill props and ActivityIndicator tints.
 *
 * MUST stay in sync with tailwind.config.js `theme.extend.colors` (same hex,
 * same names). Everything styleable with className uses the Tailwind names;
 * this file exists only for component props.
 */
import type { ViewStyle } from 'react-native';

export const colors = {
  sage: '#60953c',
  sageLight: '#7db050',
  sagePale: '#e8f2df',
  sageDark: '#4e7a2f',
  sageDeep: '#3b5c23',
  parchment: '#F9F7F6',
  parchmentMid: '#F0EEEC',
  parchmentDark: '#E8E5E2',
  ink: '#111827',
  inkMid: '#374151',
  inkMuted: '#6B7280',
  inkSubtle: '#9CA3AF',
  line: '#E5E7EB',
  white: '#FFFFFF',
} as const;

/**
 * The prototype's box-shadows, as RN shadow props (styleable via className
 * only for the plain Tailwind presets — the sage glows are colored shadows,
 * which NativeWind's arbitrary-value classes do not reliably compile on
 * native, hence style props).
 *
 * react-native-web turns these into box-shadow, so web matches too.
 */
export const shadows = {
  /** Prototype `shadow-sm` on white cards. */
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  /** Prototype `shadow-xl` on the notification banner. */
  banner: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  /** Prototype `0 4px 16px rgba(96,149,60,0.3)` on green CTAs. */
  ctaGlow: {
    shadowColor: '#60953c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  /** Prototype `0 2px 8px rgba(96,149,60,0.4)` on the small sage badges. */
  badgeGlow: {
    shadowColor: '#60953c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
} satisfies Record<string, ViewStyle>;
