import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import {
  location,
  notifications,
  photoPicker,
  systemSettings,
  walkDetector,
  type PermissionState,
} from '@/adapters';
import { SecondaryButton } from '@/components/buttons';
import { IcBell, IcCamera, IcLocation, IcWalk } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { SettingsRow, SettingsSection } from '@/components/settings-ui';
import { colors } from '@/lib/theme';

/**
 * 권한 관리 (prototype SettingsPermissionsScreen, App.tsx 2231-2277).
 *
 * The prototype hardcodes five rows with fixed statuses. These are read live
 * from the adapters, which also means one prototype row is gone: 사진 보관함.
 * The library picker runs through PHPickerViewController out of process, so
 * this app holds no photo-library permission — a row saying 허용됨 would be
 * inventing a permission that does not exist.
 *
 * Statuses refresh on focus rather than on a timer: the only way they change
 * is the user leaving for the Settings app and coming back.
 */

type PermissionRow = {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tileClassName: string;
  state: PermissionState;
  /** Extra line when the state alone would mislead. */
  note?: string;
};

function stateLabel(state: PermissionState): { text: string; className: string } {
  switch (state) {
    case 'granted':
      return { text: '허용됨', className: 'text-emerald-500' };
    case 'denied':
      return { text: '거부됨', className: 'text-red-500' };
    case 'prompt':
      return { text: '미설정', className: 'text-ink-muted' };
    case 'unavailable':
      return { text: '해당 없음', className: 'text-ink-subtle' };
    default:
      return { text: '확인 불가', className: 'text-ink-subtle' };
  }
}

/** Motion has no adapter of its own; the detector reports it. */
function toPermissionState(raw: string): PermissionState {
  if (raw === 'granted' || raw === 'denied' || raw === 'prompt' || raw === 'unavailable') {
    return raw;
  }
  return 'unknown';
}

export default function PermissionsScreen() {
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);

  const read = useCallback(async () => {
    const [locationResult, notificationResult, cameraResult, diagnosticsResult] = await Promise.all(
      [
        location.getPermission(),
        notifications.getPermission(),
        photoPicker.getCameraPermission(),
        walkDetector.getDiagnostics(),
      ],
    );

    const locationState: PermissionState = locationResult.ok
      ? locationResult.value.background === 'granted'
        ? 'granted'
        : locationResult.value.foreground
      : 'unknown';

    // Always vs When In Use is the difference between detection working in the
    // background and not working at all, so the row says which one this is.
    const locationNote =
      locationResult.ok &&
      locationResult.value.foreground === 'granted' &&
      locationResult.value.background !== 'granted'
        ? '앱 사용 중만 허용됨 — 백그라운드 감지가 동작하지 않아요'
        : undefined;

    setRows([
      {
        key: 'location',
        title: '위치 접근',
        subtitle: '걷는 장소를 기록하는 데 사용돼요',
        icon: <IcLocation size={18} color={colors.sageDark} />,
        tileClassName: 'bg-sage-pale',
        state: locationState,
        note: locationNote,
      },
      {
        key: 'motion',
        title: '동작 및 피트니스',
        subtitle: '걷기 활동 감지에 사용돼요',
        icon: <IcWalk size={18} color={colors.sageDark} />,
        tileClassName: 'bg-sage-pale',
        state: diagnosticsResult.ok
          ? toPermissionState(diagnosticsResult.value.motionAuthorization)
          : 'unknown',
      },
      {
        key: 'notifications',
        title: '알림',
        subtitle: '산책 감지 후 기록 제안 알림',
        icon: <IcBell size={18} color={colors.inkMid} />,
        tileClassName: 'bg-amber-pale',
        state: notificationResult.ok ? notificationResult.value : 'unknown',
      },
      {
        key: 'camera',
        title: '카메라',
        subtitle: '사진 촬영으로 산책 기록',
        icon: <IcCamera size={18} color={colors.inkMid} />,
        tileClassName: 'bg-indigo-pale',
        state: cameraResult.ok ? cameraResult.value : 'unknown',
      },
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void read();
    }, [read]),
  );

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader title="권한 관리" onBack={() => router.back()} />

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-8">
        <Text className="mb-5 px-1 text-xs leading-relaxed text-ink-muted">
          Mowa에서 사용하는 권한을 확인하고 기기 설정에서 변경할 수 있어요.
        </Text>

        <SettingsSection title="권한">
          {rows.map((row, index) => {
            const label = stateLabel(row.state);
            return (
              <SettingsRow
                key={row.key}
                icon={row.icon}
                tileClassName={row.tileClassName}
                title={row.title}
                subtitle={row.note ?? row.subtitle}
                divider={index < rows.length - 1}
                right={
                  <View className="flex-row items-center gap-1.5">
                    <Text className={`text-xs font-medium ${label.className}`}>{label.text}</Text>
                  </View>
                }
              />
            );
          })}
        </SettingsSection>

        {systemSettings.isAvailable ? (
          <>
            <SecondaryButton
              label="기기 설정 열기"
              onPress={() => {
                setOpenError(null);
                void systemSettings.open().then((result) => {
                  if (!result.ok) setOpenError(result.error);
                });
              }}
            />
            {openError !== null ? (
              <Text className="mt-2 text-center text-xs text-red-500">{openError}</Text>
            ) : null}
          </>
        ) : null}

        <Text className="mt-4 px-1 text-center text-xs leading-relaxed text-ink-subtle">
          권한 변경은 기기 설정 앱에서 직접 해야 해요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
