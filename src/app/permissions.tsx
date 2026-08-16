import { useCallback, useState } from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { location, notifications, systemSettings, type PermissionState } from '@/adapters';
import { PrimaryButton } from '@/components/buttons';
import { IcBell, IcLocation } from '@/components/icons';
import { SettingsRow, SettingsSection } from '@/components/settings-ui';
import { colors } from '@/lib/theme';

/**
 * Login → home permission gate (new — no prototype screen to match).
 *
 * Reachable only via `router.replace('/permissions')` from the root layout's
 * gate, after sign-in, while a permission is still `prompt`. There is no back
 * button: this is a `replace` target, not a pushed screen, and there is
 * nothing to pop to. "시작하기" is simultaneously "proceed" and "skip" — see
 * _layout.tsx for why a second skip button is deliberately absent.
 *
 * Unlike `/settings/permissions`, THIS screen requests. Buttons appear only
 * while a permission is `prompt`, because the iOS system prompt is shown once
 * per install — a button that fires a second request would just silently
 * return the already-decided value.
 */

type LocationRowState =
  | { kind: 'prompt' }
  | { kind: 'foreground-only' }
  | { kind: 'always' }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

function describeLocation(
  result: Awaited<ReturnType<typeof location.getPermission>>,
): LocationRowState {
  if (!result.ok) return { kind: 'unavailable' };
  const { foreground, background } = result.value;
  if (foreground === 'unavailable') return { kind: 'unavailable' };
  if (foreground === 'denied') return { kind: 'denied' };
  if (background === 'granted') return { kind: 'always' };
  if (foreground === 'granted') return { kind: 'foreground-only' };
  return { kind: 'prompt' };
}

function RowActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-full bg-sage px-3 py-1.5 active:opacity-70">
      <Text className="text-xs font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

function RowLabel({ text, tone }: { text: string; tone: 'muted' | 'positive' | 'negative' }) {
  const className =
    tone === 'positive'
      ? 'text-emerald-500'
      : tone === 'negative'
        ? 'text-red-500'
        : 'text-ink-muted';
  return <Text className={`text-xs font-medium ${className}`}>{text}</Text>;
}

export default function PermissionsScreen() {
  const [locationState, setLocationState] = useState<LocationRowState>({ kind: 'prompt' });
  const [notificationState, setNotificationState] = useState<PermissionState>('prompt');
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const read = useCallback(async () => {
    const [locationResult, notificationResult] = await Promise.all([
      location.getPermission(),
      notifications.getPermission(),
    ]);
    setLocationState(describeLocation(locationResult));
    setNotificationState(notificationResult.ok ? notificationResult.value : 'unknown');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void read();
    }, [read]),
  );

  const requestLocationForeground = () => {
    void location.requestForegroundPermission().then((result) => {
      setLocationState(describeLocation(result));
    });
  };

  const requestLocationBackground = () => {
    void location.requestBackgroundPermission().then((result) => {
      setLocationState(describeLocation(result));
    });
  };

  const requestNotifications = () => {
    void notifications.requestPermission().then((result) => {
      setNotificationState(result.ok ? result.value : 'unknown');
    });
  };

  const openSettings = () => {
    setSettingsError(null);
    void systemSettings.open().then((result) => {
      if (!result.ok) setSettingsError(result.error);
    });
  };

  const locationRight = (() => {
    switch (locationState.kind) {
      case 'prompt':
        return <RowActionButton label="허용" onPress={requestLocationForeground} />;
      case 'foreground-only':
        return <RowActionButton label="Always로 변경" onPress={requestLocationBackground} />;
      case 'always':
        return <RowLabel text="항상 허용됨" tone="positive" />;
      case 'denied':
        return <RowActionButton label="기기 설정 열기" onPress={openSettings} />;
      case 'unavailable':
        return <RowLabel text="해당 없음" tone="muted" />;
    }
  })();

  const locationSubtitle =
    locationState.kind === 'foreground-only'
      ? '앱 사용 중만 허용됨 — 백그라운드 감지가 동작하지 않아요'
      : '걷는 장소를 기록하고, 산책이 끝난 걸 자동으로 감지해요';

  const notificationRight =
    notificationState === 'prompt' ? (
      <RowActionButton label="허용" onPress={requestNotifications} />
    ) : notificationState === 'granted' ? (
      <RowLabel text="허용됨" tone="positive" />
    ) : notificationState === 'denied' ? (
      <RowLabel text="거부됨" tone="negative" />
    ) : (
      <RowLabel text="해당 없음" tone="muted" />
    );

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <View className="px-5 pb-2 pt-6">
        <Text className="text-lg font-bold text-ink">권한을 확인해주세요</Text>
        <Text className="mt-1 text-sm text-ink-muted">
          허용하지 않아도 계속 사용할 수 있어요. 나중에 설정에서 바꿀 수 있어요.
        </Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-8">
        <SettingsSection title="권한">
          <SettingsRow
            icon={<IcLocation size={18} color={colors.sageDark} />}
            tileClassName="bg-sage-pale"
            title="위치 접근"
            subtitle={locationSubtitle}
            divider
            right={locationRight}
          />
          <SettingsRow
            icon={<IcBell size={18} color={colors.inkMid} />}
            tileClassName="bg-amber-pale"
            title="알림"
            subtitle="산책 감지 후 기록 제안 알림"
            right={notificationRight}
          />
        </SettingsSection>

        {settingsError !== null ? (
          <Text className="mb-4 text-center text-xs text-red-500">{settingsError}</Text>
        ) : null}
      </ScrollView>

      <View className="px-6 pb-6 pt-2">
        <PrimaryButton hero glow label="시작하기" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}
