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
      },
    },
  },
  plugins: [],
};
