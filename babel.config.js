/**
 * NativeWind v4 requires an explicit Babel config: `jsxImportSource` routes JSX
 * through NativeWind's factory so `className` works on React Native primitives,
 * and `nativewind/babel` compiles the Tailwind output.
 *
 * Do NOT add `react-native-reanimated/plugin` here. Reanimated 4 bundles the
 * worklets plugin internally, and adding it again fails the build with
 * "Duplicate plugin/preset detected".
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
