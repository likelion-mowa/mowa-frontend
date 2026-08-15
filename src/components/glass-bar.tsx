import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { usePressScale } from '@/lib/animations';

/**
 * The prototype's floating glass chrome (`GlassBarShell` / `glassCircleStyle` /
 * `glassPillStyle`, src/App.tsx 1733-1772), shared by home and the archive.
 *
 * The rgba values below are surface effects rather than palette colors — they
 * only mean anything layered over the bar's own dark scrim — so they live here
 * instead of palette.json.
 */

const GLASS = {
  circleFill: 'rgba(255,255,255,0.16)',
  pillFill: 'rgba(255,255,255,0.13)',
  circleBorder: 'rgba(255,255,255,0.28)',
  pillBorder: 'rgba(255,255,255,0.22)',
  /** Fades the content behind the bar so white-on-glass controls stay legible. */
  scrim: ['rgba(15,15,15,0)', 'rgba(15,15,15,0.52)'] as const,
};

// expo-blur's web backend maps intensity to `blur(intensity / 5 px)`, so the
// prototype's `backdrop-filter: blur(20px)` would be 100 — full frost on iOS,
// which is heavier than the design. 70 keeps web close (14px) without turning
// the bar opaque on device. Worth a look during the device review.
const BLUR_INTENSITY = 70;

/**
 * Both glass surfaces are 52 tall and fully rounded, so one radius drives the
 * BlurView's clip AND the shadow wrapper's shape below.
 */
const GLASS_RADIUS = 26;

/**
 * Carried by the wrapper AROUND each BlurView, never by the BlurView itself —
 * a view that clips its children cannot also cast a shadow on iOS.
 *
 * `borderRadius` is part of the shadow, not decoration: react-native-web turns
 * these props into a CSS `box-shadow`, and a box-shadow follows the radius of
 * the element it sits on — not the radius of the rounded child inside it. With
 * the wrapper left square, web drew a rectangular halo behind every round
 * button while iOS looked correct (measured 2026-08-15). The wrapper is
 * transparent, so the radius costs nothing on iOS beyond making its shadow path
 * match what the user actually sees.
 */
const glassShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.22,
  shadowRadius: 24,
  borderRadius: GLASS_RADIUS,
};

/**
 * Pins its children to the bottom of the screen over a dark gradient. Sits
 * outside the screen's ScrollView, so it must not swallow taps meant for the
 * content behind it.
 */
export function GlassBarShell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0">
      <LinearGradient
        colors={GLASS.scrim}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        className="flex-row items-center gap-3 px-4 pt-5"
        style={{ paddingBottom: Math.max(insets.bottom, 12) + 16 }}>
        {children}
      </View>
    </View>
  );
}

export function GlassCircleButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}>
      <Animated.View style={[{ transform: [{ scale }] }, glassShadow]}>
        <BlurView
          intensity={BLUR_INTENSITY}
          tint="light"
          style={{
            height: 52,
            width: 52,
            borderRadius: GLASS_RADIUS,
            borderWidth: 1,
            borderColor: GLASS.circleBorder,
            overflow: 'hidden',
          }}>
          {/* The fill goes inside: expo-blur owns backgroundColor on web. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GLASS.circleFill }]} />
          <View className="h-full w-full items-center justify-center">{children}</View>
        </BlurView>
      </Animated.View>
    </Pressable>
  );
}

/** The wide glass surface between the two circles. Content is the caller's. */
export function GlassPill({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1" style={glassShadow}>
      <BlurView
        intensity={BLUR_INTENSITY}
        tint="light"
        style={{
          height: 52,
          borderRadius: GLASS_RADIUS,
          borderWidth: 1,
          borderColor: GLASS.pillBorder,
          overflow: 'hidden',
        }}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GLASS.pillFill }]} />
        {children}
      </BlurView>
    </View>
  );
}
