import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IcTrash } from '@/components/icons';
import { colors } from '@/lib/theme';

/**
 * 기록 삭제 확인 (prototype `DeleteModal`). Ported 1:1 — copy, layout and both
 * reds are the prototype's (#FEE2E2 is red-100, #EF4444 is red-500, exactly).
 *
 * An absolutely-positioned overlay rather than React Native's `Modal`, for
 * three reasons. The prototype is literally this (`absolute inset-0 z-50 flex
 * items-end`). The repo has no `Modal` anywhere, but `GlassBarShell` and the
 * root layout's flash guard are both absolute-fill overlays, so this is the
 * shape that is already proven on both targets. And `Modal` would bring a
 * react-native-web portal on one side and a separate UIViewController next to
 * react-native-screens on the other — two untested behaviours to buy an Android
 * back button and a11y isolation, on an iOS + web product.
 *
 * Mount it as the LAST child of a `flex-1` View that wraps the whole screen,
 * outside any SafeAreaView, so the backdrop reaches the notch.
 *
 * `busy` disables both actions and the backdrop; the labels deliberately do not
 * change, because a 삭제 중… string exists nowhere in the design.
 */

/** How far the card slides up on mount, mirroring the prototype's fade-in. */
const RISE_PX = 40;

export function ConfirmDeleteSheet({
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] });

  return (
    // zIndex explicitly, not just tree order: on web the screen's own absolute
    // children (the detail hero's header row) would otherwise share a stacking
    // context with this.
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} className="justify-end">
      {/* Backdrop first so the card paints over it. Animated.View carries style
          only — className on it is unverified on this stack. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제 취소"
          style={StyleSheet.absoluteFill}
          className="bg-black/50"
          disabled={busy}
          onPress={onCancel}
        />
      </Animated.View>

      <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
        <View
          className="rounded-t-3xl bg-white px-6 pt-6"
          style={{ paddingBottom: Math.max(insets.bottom, 12) + 20 }}>
          <View className="mb-5 h-1 w-10 self-center rounded-full bg-line" />

          <View className="mb-4 h-14 w-14 items-center justify-center self-center rounded-full bg-red-100">
            <IcTrash size={22} color={colors.ink} />
          </View>

          <Text className="mb-2 text-center text-[18px] font-bold text-ink">
            이 기록을 삭제할까요?
          </Text>
          <Text className="mb-6 text-center text-sm leading-relaxed text-ink-muted">
            삭제한 산책 기억은 복구할 수 없어요.
          </Text>

          {error !== null ? (
            <Text className="mb-3 text-center text-xs text-red-500">{error}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onConfirm}
            className={`mb-3 rounded-xl bg-red-500 py-3.5 active:opacity-80 ${busy ? 'opacity-50' : ''}`}>
            <Text className="text-center text-sm font-semibold text-white">삭제하기</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onCancel}
            className={`py-3 active:opacity-70 ${busy ? 'opacity-50' : ''}`}>
            <Text className="text-center text-sm font-medium text-ink-muted">취소</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
