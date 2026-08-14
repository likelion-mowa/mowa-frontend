/**
 * Prototype palette as JS values, for the places className cannot reach —
 * react-native-svg stroke/fill props and ActivityIndicator tints.
 *
 * MUST stay in sync with tailwind.config.js `theme.extend.colors` (same hex,
 * same names). Everything styleable with className uses the Tailwind names;
 * this file exists only for component props.
 */
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
