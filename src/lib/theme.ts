/**
 * Prototype palette as JS values, for the places className cannot reach —
 * react-native-svg stroke/fill props, Animated color interpolations and
 * shadows. `palette.json` is the single source; tailwind.config.js requires
 * the same file, so className colors and these values cannot drift apart.
 */
import type { ViewStyle } from 'react-native';

import palette from './palette.json';

export const colors = palette;

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
    shadowColor: palette.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  /**
   * Prototype `0 4px 20px rgba(96,149,60,0.45)` on the home detection card
   * (App.tsx:1218). Deliberately not ctaGlow: that one is the generic green
   * button glow and this card is bloomier — the prototype also stacks a blurred
   * radial behind it, which a wider, stronger colored shadow stands in for.
   */
  detectionGlow: {
    shadowColor: palette.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  /** Prototype `0 2px 8px rgba(96,149,60,0.4)` on the small sage badges. */
  badgeGlow: {
    shadowColor: palette.sage,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
} satisfies Record<string, ViewStyle>;
