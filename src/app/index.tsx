import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { GlassBarShell, GlassCircleButton, GlassPill } from '@/components/glass-bar';
import { IcDocument, IcUser } from '@/components/icons';
import { useAnimatedToggle } from '@/lib/animations';
import { colors } from '@/lib/theme';

/**
 * Home (prototype HomeScreen, src/App.tsx 1118-1288) — the first screen of the
 * app and the one a hackathon judge opens on the deployed web URL. Developer
 * diagnostics stay on /debug.
 *
 * The prototype's character carries a CSS `drop-shadow`; that filter has no
 * portable RN equivalent (react-native-web maps shadow props to box-shadow,
 * which would draw the image's bounding box), so only the ground ellipse is
 * ported — it is what actually grounds the character.
 */

const CHARACTER = require('../../assets/images/mowa-character.png');

// Source is 880x1245; keep the ratio so the character never squashes.
const CHARACTER_WIDTH = 200;
const CHARACTER_HEIGHT = Math.round((CHARACTER_WIDTH * 1245) / 880);

const BUBBLE_HOLD_MS = 2000;
const BUBBLE_FADE_MS = 400;

/** The prototype's own hour buckets (its HomeGlassBar timeMessage). */
function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 9) return '좋은 아침이에요 ☀️';
  if (hour >= 9 && hour < 12) return '산책하기 좋은 오전이에요';
  if (hour >= 12 && hour < 14) return '좋은 점심이에요 🌿';
  if (hour >= 14 && hour < 18) return '좋은 오후예요';
  if (hour >= 18 && hour < 21) return '오늘 하루도 기록해볼까요?';
  return '오늘 하루 어떠셨나요? 🌙';
}

function clockFor(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function CharacterHero() {
  const [bubbleMounted, setBubbleMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    },
    [],
  );

  const showBubble = () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    setBubbleMounted(true);
    Animated.timing(opacity, {
      toValue: 1,
      duration: BUBBLE_FADE_MS,
      useNativeDriver: true,
    }).start();

    hideTimer.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: BUBBLE_FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setBubbleMounted(false);
      });
    }, BUBBLE_HOLD_MS);
  };

  return (
    <View className="items-center px-6 pb-2 pt-6">
      <View className="relative items-center">
        {bubbleMounted ? (
          <Animated.View style={{ position: 'absolute', top: 0, right: '52%', opacity, zIndex: 10 }}>
            <View className="rounded-xl bg-bubble px-3.5 py-2.5">
              <Text className="text-xs font-bold leading-5 text-bubble-ink">
                안녕하세요{'\n'}MOWA예요!
              </Text>
            </View>
            {/* Tail: a rotated square reads as a triangle once the bubble overlaps it. */}
            <View
              className="absolute h-3 w-3 bg-bubble"
              style={{ bottom: 4, right: -4, transform: [{ rotate: '45deg' }] }}
            />
          </Animated.View>
        ) : null}

        <Pressable
          accessibilityRole="image"
          accessibilityLabel="MOWA 캐릭터"
          onPress={showBubble}>
          <Image
            source={CHARACTER}
            style={{ width: CHARACTER_WIDTH, height: CHARACTER_HEIGHT }}
            resizeMode="contain"
          />
        </Pressable>

        <Svg width={100} height={14} style={{ marginTop: -10 }}>
          <Defs>
            <RadialGradient id="groundShadow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#000000" stopOpacity={0.12} />
              <Stop offset="55%" stopColor="#000000" stopOpacity={0.03} />
              <Stop offset="80%" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={50} cy={7} rx={50} ry={7} fill="url(#groundShadow)" />
        </Svg>
      </View>

      <Text
        className="mt-1 text-center font-extrabold text-sage-lime"
        style={{ fontSize: 36, letterSpacing: -0.7 }}>
        MOWA
      </Text>
      <Text className="mt-1.5 text-center text-sm font-medium text-ink-muted">
        당신의 산책을 모와드릴까요?
      </Text>
    </View>
  );
}

function HomeGlassBar() {
  const [showTime, setShowTime] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const size = useAnimatedToggle(showTime, 200);

  // Ticking every second only matters while the clock is showing; otherwise the
  // greeting changes at most once an hour.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), showTime ? 1_000 : 60_000);
    return () => clearInterval(id);
  }, [showTime]);

  return (
    <GlassBarShell>
      <GlassCircleButton accessibilityLabel="설정" onPress={() => router.push('/settings')}>
        <IcUser size={22} color={colors.white} />
      </GlassCircleButton>

      <GlassPill>
        <View className="h-full flex-row items-center gap-3 pl-2 pr-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showTime ? '인사말 보기' : '현재 시각 보기'}
            onPress={() => setShowTime((value) => !value)}>
            <LinearGradient
              colors={['rgba(130,190,80,0.85)', 'rgba(70,120,35,0.75)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                height: 36,
                width: 36,
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.45)',
              }}
            />
          </Pressable>

          <Animated.Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.white,
              fontWeight: '600',
              letterSpacing: -0.2,
              fontSize: size.interpolate({ inputRange: [0, 1], outputRange: [13, 17] }),
            }}>
            {showTime ? clockFor(now) : greetingFor(now)}
          </Animated.Text>
        </View>
      </GlassPill>

      <GlassCircleButton accessibilityLabel="기록장" onPress={() => router.push('/archive')}>
        <IcDocument size={22} color={colors.white} />
      </GlassCircleButton>
    </GlassBarShell>
  );
}

export default function HomeScreen() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <ScrollView className="flex-1" contentContainerClassName="pb-32">
        <CharacterHero />
      </ScrollView>
      <HomeGlassBar />
    </SafeAreaView>
  );
}
