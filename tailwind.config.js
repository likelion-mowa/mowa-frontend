/**
 * Tailwind CSS v3 — NOT v4.
 *
 * NativeWind 4.2.6 depends on react-native-css-interop@0.2.6, whose peer range
 * is `tailwindcss: "~3"`. Installing v4 makes NativeWind fail at runtime.
 *
 * @type {import('tailwindcss').Config}
 */
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
        // Prototype palette — hex values transcribed from the team's design
        // prototype ("Walklog Mobile App MVP" src/index.css @theme). Screens
        // must use these names, never inline hex.
        sage: {
          DEFAULT: '#60953c',
          light: '#7db050',
          pale: '#e8f2df',
          dark: '#4e7a2f',
          deep: '#3b5c23',
        },
        parchment: {
          DEFAULT: '#F9F7F6',
          mid: '#F0EEEC',
          dark: '#E8E5E2',
        },
        ink: {
          DEFAULT: '#111827',
          mid: '#374151',
          muted: '#6B7280',
          subtle: '#9CA3AF',
        },
        line: {
          DEFAULT: '#E5E7EB',
          light: '#F3F4F6',
        },
      },
    },
  },
  plugins: [],
};
