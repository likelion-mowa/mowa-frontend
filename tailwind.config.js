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
          lime: palette.sageLime,
          pale: palette.sagePale,
          dark: palette.sageDark,
          deep: palette.sageDeep,
        },
        // Photo-less tiles and month labels in the archive; the speech bubble
        // on home. Cooler than the sage family on purpose — the prototype uses
        // them as surfaces behind sage content, not as sage tints.
        mint: {
          DEFAULT: palette.mint,
          pale: palette.mintPale,
        },
        bubble: {
          DEFAULT: palette.bubble,
          ink: palette.bubbleInk,
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
        // Settings icon tiles. The prototype gives each row's tile its own
        // pastel; these two are the non-sage ones (bell, shield).
        amber: {
          pale: palette.amberPale,
        },
        indigo: {
          pale: palette.indigoPale,
        },
      },
    },
  },
  plugins: [],
};
