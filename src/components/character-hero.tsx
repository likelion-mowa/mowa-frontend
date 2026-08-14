import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, Text, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

/**
 * The MOWA character, its tap-to-speak bubble, the ground shadow and the
 * wordmark — the prototype's shared brand block, used by both the onboarding
 * screen (App.tsx OnboardingScreen) and home (HomeScreen).
 *
 * Lifted out of `src/app/index.tsx` when onboarding needed the same block. The
 * two callers differ only in size and tagline, so those are props; everything
 * visual stays here so they cannot drift.
 *
 * The prototype's character carries a CSS `drop-shadow`; that filter has no
 * portable RN equivalent (react-native-web maps shadow props to box-shadow,
 * which would draw the image's bounding box), so only the ground ellipse is
 * ported — it is what actually grounds the character.
 */

const CHARACTER = require('../../assets/images/mowa-character.png');

/** Intrinsic 880×1245, so the height follows from the requested width. */
const ASPECT = 1245 / 880;

const BUBBLE_HOLD_MS = 2000;
const BUBBLE_FADE_MS = 400;

type CharacterHeroProps = {
  /** Home uses 200, onboarding 210 (prototype values). */
  width?: number;
  tagline: string;
  className?: string;
};

export function CharacterHero({
  width = 200,
  tagline,
  className = 'items-center px-6 pb-2 pt-6',
}: CharacterHeroProps) {
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
    <View className={className}>
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

        <Pressable accessibilityRole="image" accessibilityLabel="MOWA 캐릭터" onPress={showBubble}>
          <Image
            source={CHARACTER}
            style={{ width, height: Math.round(width * ASPECT) }}
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
      <Text className="mt-1.5 text-center text-sm font-medium text-ink-muted">{tagline}</Text>
    </View>
  );
}
