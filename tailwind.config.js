/**
 * Tailwind CSS v3 — NOT v4.
 *
 * NativeWind 4.2.6 depends on react-native-css-interop@0.2.6, whose peer range
 * is `tailwindcss: "~3"`. Installing v4 makes NativeWind fail at runtime.
 *
 * @type {import('tailwindcss').Config}
 */
// Prototype palette — hex values transcribed from the team's design prototype
// ("Walklog Mobile App MVP" src/index.css @theme). Single source: the same
// file feeds src/lib/theme.ts, so className colors and component-prop colors
// (svg strokes, shadows) cannot drift apart. Screens use these names, never
// inline hex.
const palette = require('./src/lib/palette.json');

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        walk: {
          DEFAULT: '#3F8F5A',
          soft: '#E7F2EA',
        },
        sage: {
          DEFAULT: palette.sage,
          light: palette.sageLight,
          pale: palette.sagePale,
          dark: palette.sageDark,
          deep: palette.sageDeep,
        },
        parchment: {
          DEFAULT: palette.parchment,
          mid: palette.parchmentMid,
          dark: palette.parchmentDark,
        },
        ink: {
          DEFAULT: palette.ink,
          mid: palette.inkMid,
          muted: palette.inkMuted,
          subtle: palette.inkSubtle,
        },
        line: {
          DEFAULT: palette.line,
          light: palette.lineLight,
        },
      },
    },
  },
  plugins: [],
};
