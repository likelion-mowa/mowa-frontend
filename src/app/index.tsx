import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { walkDetector } from '@/adapters';

/**
 * PLACEHOLDER — replace with the real product screens.
 *
 * Intentionally holds no product design: no diary model, no forms, no copy
 * beyond a one-line status. The team owns emotion / companion / situation,
 * photos, AI generation and the archive; this file exists only so the deployed
 * web URL does not land on the developer diagnostics screen.
 *
 * Keep diagnostics at /debug.
 */
export default function IndexScreen() {
  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-3xl font-bold text-neutral-900">Mowa</Text>
        <Text className="mt-3 text-center text-sm text-neutral-500">
          {walkDetector.isAvailable
            ? '개발 중입니다.'
            : '개발 중입니다. 자동 산책 감지는 iOS 앱에서만 동작합니다.'}
        </Text>

        <Link href="/debug" asChild>
          <Pressable className="mt-10 rounded-lg bg-neutral-200 px-4 py-2 active:opacity-70">
            <Text className="text-xs text-neutral-600">개발자 진단 화면</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
