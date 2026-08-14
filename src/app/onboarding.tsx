import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { PrimaryButton } from '@/components/buttons';
import { CharacterHero } from '@/components/character-hero';

/**
 * The app's entry point while signed out (prototype OnboardingScreen,
 * src/App.tsx 640-806). One page — no carousel, no pagination, no skip.
 *
 * There is no "already seen it" flag on purpose: the prototype shows this
 * screen on every launch and sends 로그아웃 straight back to it, so
 * "signed out ⇒ onboarding" is the same rule, and it needs no third stored key.
 *
 * The prototype's CTA sits on a blurred radial bloom. RN has no portable
 * equivalent, so `glow` (the ctaGlow shadow) stands in — the same substitution
 * the diary flow already ships.
 */
export default function OnboardingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View style={{ height: 72 }} />

      <CharacterHero
        width={210}
        tagline="당신의 산책을 모와"
        className="items-center px-6"
      />

      <View className="flex-1" />

      <View className="px-6" style={{ marginBottom: 24 }}>
        <PrimaryButton hero glow label="시작하기" onPress={() => router.push('/login')} />
      </View>

      {/*
        Brand signature. The prototype uses #BDBDBD and #A0A0A0, two greys with
        no palette entry; ink-subtle (#9CA3AF) covers both and opacity keeps the
        wordmark lighter than the line under it. Flagged for the copy/palette
        review rather than adding two near-duplicate hexes.
      */}
      <View className="items-center" style={{ marginBottom: 32 }}>
        <Text
          className="text-center font-light text-ink-subtle opacity-70"
          style={{ fontSize: 15, letterSpacing: 2.1 }}>
          MO:WALK
        </Text>
        <Text className="mt-1 text-center text-ink-subtle" style={{ fontSize: 13 }}>
          기록이 쌓이면, 기억이 됩니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}
