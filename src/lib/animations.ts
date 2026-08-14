import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Shared micro-interaction hooks, porting the prototype's CSS transitions
 * (`transition-all duration-200/300`, `active:scale-[0.97]`) to RN core
 * Animated — NativeWind's transition/animate classes are unverified on this
 * stack, Animated is not.
 */

/**
 * Press feedback: quick dip to 0.97 on press-in, easing back on release.
 * Attach `scale` to a transform on an Animated.View INSIDE the Pressable
 * (transforms ride the native driver; keep color animations on a separate
 * JS-driven view).
 */
export function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.timing(scale, { toValue: 0.97, duration: 120, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  return { scale, onPressIn, onPressOut };
}

/**
 * A 0↔1 value that eases toward `active` whenever it flips — the RN stand-in
 * for a CSS transition on background/border/width. JS driver on purpose:
 * colors and layout sizes cannot use the native one.
 */
export function useAnimatedToggle(active: boolean, duration: number): Animated.Value {
  const value = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: active ? 1 : 0, duration, useNativeDriver: false }).start();
  }, [active, duration, value]);
  return value;
}
