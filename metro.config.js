const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/**
 * Hard-exclude iOS-only packages from the web bundle.
 *
 * The primary defence is the adapter split in src/adapters: native packages are
 * imported only from `*.native.ts`, and Metro never resolves `.native.ts` for
 * the web platform. This resolver is a second layer so that an accidental
 * import in a base file fails loudly at runtime instead of silently shipping a
 * native package to the web build.
 *
 * `type: 'empty'` is Expo's documented mechanism for this. Do NOT use
 * `resolver.blockList` — it is global rather than per-platform and would break
 * the iOS build as well.
 */
const NATIVE_ONLY = ['@kingstinct/react-native-healthkit', 'react-native-nitro-modules'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    NATIVE_ONLY.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))
  ) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
