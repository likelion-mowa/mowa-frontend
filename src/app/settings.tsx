import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';

import { ScreenHeader } from '@/components/screen-header';

/**
 * Placeholder for 설정. The prototype has three settings screens (자동 감지,
 * 권한 관리, 계정) but none of them is wired to a server API, so they are a
 * later task. This screen exists so home's and the archive's settings
 * affordances lead somewhere honest instead of nowhere.
 *
 * It also carries the app's only entry point to /debug. The placeholder home
 * screen used to link there, and the phone has no address bar — without a link
 * somewhere, on-device diagnostics become unreachable. Keeping it here honors
 * the rule that the root route stays free of developer tooling.
 *
 * The copy is derived, not from the prototype — flagged for team review.
 */
export default function SettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader title="설정" onBack={() => router.back()} />
      <View className="flex-1 items-center justify-center px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-sage-pale">
          <Text className="text-3xl">🌿</Text>
        </View>
        <Text className="mt-5 text-center text-[17px] font-bold text-ink">
          설정 화면을 준비 중이에요
        </Text>
        <Text className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
          자동 감지와 권한 관리는{'\n'}곧 여기에서 바꿀 수 있어요.
        </Text>

        <Link href="/debug" asChild>
          <Pressable accessibilityRole="link" className="mt-10 py-3 active:opacity-70">
            <Text className="text-center text-xs font-medium text-ink-subtle">개발자 진단 열기</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
