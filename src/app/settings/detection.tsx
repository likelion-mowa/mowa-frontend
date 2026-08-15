import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { IcSparkle, IcWalk } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { SettingsFact, SettingsRow, SettingsSection } from '@/components/settings-ui';
import { Toggle } from '@/components/toggle';
import { colors } from '@/lib/theme';
import { useDetection } from '@/stores/detection-store';

/**
 * 자동 감지 설정 (prototype SettingsAutoScreen, App.tsx 2150-2229) — with the
 * prototype's controls reduced to the ones that are real.
 *
 * The prototype offers 최소 산책 시간 / 최소 이동 거리 sliders and an
 * 야외 활동만 switch. None of them exists: `WalkDetectorPort.start()` takes
 * only a mechanism, the Core hardcodes thresholdSteps/cooldown/endDebounce
 * (WalkDetectorModule.swift:63-65), and no indoor/outdoor classification is
 * exposed at all. Shipping them would be four controls that change nothing.
 *
 * So the toggle is real — it is the app's only product-code call to
 * start()/stop() — and all three thresholds are shown read-only, sourced from
 * getDiagnostics(). None of them is mirrored as a TypeScript constant: the
 * payload carries the Core's own UserDefaults-backed getters, so what is on
 * screen is what is in effect. A mirrored copy would be a second source of
 * truth that no gate here could catch drifting from the Swift literals at
 * WalkDetectorModule.swift:63-65.
 */
export default function DetectionSettingsScreen() {
  const phase = useDetection((state) => state.phase);
  const enabled = useDetection((state) => state.enabled);
  const diagnostics = useDetection((state) => state.diagnostics);
  const error = useDetection((state) => state.error);
  const load = useDetection((state) => state.load);
  const setEnabled = useDetection((state) => state.setEnabled);

  useEffect(() => {
    void load();
  }, [load]);

  const unavailable = phase === 'unavailable';
  const running = diagnostics?.isRunning ?? false;
  const warnings = diagnostics?.warnings ?? [];

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader title="자동 감지 설정" onBack={() => router.back()} />

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-8">
        <View className="mb-5 flex-row gap-2 rounded-xl border border-sage/20 bg-sage-pale/60 p-3">
          <View className="pt-0.5">
            <IcSparkle size={14} color={colors.sageDark} />
          </View>
          <Text className="flex-1 text-xs leading-relaxed text-ink-mid">
            걷기가 감지되면 산책이 끝난 뒤 기록 제안 알림을 보내드려요.
          </Text>
        </View>

        <SettingsSection title="산책 감지">
          <SettingsRow
            icon={<IcWalk size={18} color={colors.sageDark} />}
            title="자동 감지 사용"
            subtitle={unavailable ? '이 기능은 iOS 앱에서만 동작해요' : '걷기 활동을 자동으로 인식'}
            disabled={unavailable}
            right={
              <Toggle
                accessibilityLabel="자동 감지 사용"
                value={enabled}
                disabled={unavailable || phase === 'loading'}
                onValueChange={(next) => void setEnabled(next)}
              />
            }
          />
        </SettingsSection>

        {/*
          The preference is intent; `isRunning` is what the detector is actually
          doing. They diverge when iOS revokes Always location — the Core then
          skips the keepalive half silently — so both are shown rather than
          letting the switch imply something that is not happening.
        */}
        {error !== null ? (
          <View className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-xs leading-relaxed text-red-500">{error}</Text>
          </View>
        ) : null}

        {!unavailable ? (
          <SettingsSection title="현재 감지 기준">
            <SettingsFact label="감지 동작 중" value={running ? '예' : '아니오'} divider />
            {/*
              The three criteria in the order a walk meets them: it has to pass
              the step bar, then hold still long enough to count as over, and
              only then may another notification follow.
            */}
            <SettingsFact
              label="걸음 수 기준"
              value={diagnostics === null ? '—' : `${diagnostics.thresholdSteps}보`}
              divider
            />
            <SettingsFact
              label="종료 판단 대기 시간"
              value={
                diagnostics === null ? '—' : `${Math.round(diagnostics.endDebounceSeconds)}초`
              }
              divider
            />
            <SettingsFact
              label="재알림 간격"
              value={
                diagnostics === null ? '—' : `${Math.round(diagnostics.cooldownSeconds)}초`
              }
              divider
            />
            <SettingsFact
              label="감지 방식"
              value={diagnostics === null ? '—' : diagnostics.mechanism}
            />
          </SettingsSection>
        ) : null}

        {warnings.length > 0 ? (
          <SettingsSection title="확인이 필요해요">
            {warnings.map((warning, index) => (
              <SettingsRow
                key={warning}
                title={warning}
                divider={index < warnings.length - 1}
              />
            ))}
          </SettingsSection>
        ) : null}

        <Text className="px-1 text-xs leading-relaxed text-ink-subtle">
          걸음 수 기준과 재알림 간격은 앱에 고정되어 있어요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
