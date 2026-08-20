import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Slider from '@react-native-community/slider';

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
 * 야외 활동만 switch. None of them exists — `WalkDetectorPort.start()` takes
 * only a mechanism and no indoor/outdoor classification is exposed at all —
 * so that one stays out.
 *
 * The three detection criteria (걸음 수 기준 / 종료 판단 대기 시간 / 재알림
 * 간격) ARE real, writable settings (`WalkDetectorPort.setThresholdSteps` /
 * `setEndDebounceSeconds` / `setCooldownSeconds`), so each gets a slider.
 * None is mirrored as a TypeScript constant: the payload carries the Core's
 * own UserDefaults-backed getters, so what is on screen is what is in
 * effect. A mirrored copy would be a second source of truth that no gate
 * here could catch drifting from the Swift side. 감지 방식 alone stays
 * read-only — this screen has no mechanism picker.
 */

/**
 * Shared by all three detection-criteria sliders. Drag-only local state so
 * the label moves under the finger; the store commit (and thus
 * `refreshDiagnostics()` re-read) happens on release, not per-frame.
 */
function SliderRow({
  label,
  unit,
  minimumValue,
  maximumValue,
  step,
  value,
  onChange,
  disabled,
  divider = true,
}: {
  label: string;
  unit: string;
  minimumValue: number;
  maximumValue: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
  divider?: boolean;
}) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? value;

  return (
    <View className={`px-4 py-3.5 ${divider ? 'border-b border-line' : ''}`}>
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-sm text-ink-muted">{label}</Text>
        <Text className="text-sm font-semibold text-ink">
          {shown}
          {unit}
        </Text>
      </View>
      <Slider
        accessibilityLabel={label}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        value={value}
        disabled={disabled}
        minimumTrackTintColor={colors.sage}
        maximumTrackTintColor={colors.line}
        thumbTintColor={colors.sage}
        onValueChange={setDragValue}
        onSlidingComplete={(next) => {
          setDragValue(null);
          onChange(Math.round(next));
        }}
      />
    </View>
  );
}

export default function DetectionSettingsScreen() {
  const phase = useDetection((state) => state.phase);
  const enabled = useDetection((state) => state.enabled);
  const diagnostics = useDetection((state) => state.diagnostics);
  const error = useDetection((state) => state.error);
  const load = useDetection((state) => state.load);
  const setEnabled = useDetection((state) => state.setEnabled);
  const setThresholdSteps = useDetection((state) => state.setThresholdSteps);
  const setEndDebounceSeconds = useDetection((state) => state.setEndDebounceSeconds);
  const setCooldownSeconds = useDetection((state) => state.setCooldownSeconds);

  useEffect(() => {
    // Opening this screen must not raise a permission dialog. `load()`
    // reconciles, and reconciling calls `walkDetector.start()` whenever the
    // stored preference is on while the detector is idle — which raises the
    // Motion, Always-location and HealthKit prompts at once. The root layout
    // already runs `load()` once per signed-in session (after the permission
    // gate), so here the numbers only need refreshing; `load()` stays as the
    // fallback for the case where that never ran.
    if (useDetection.getState().phase === 'idle') void load();
    else void useDetection.getState().refreshDiagnostics();
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
            {diagnostics === null ? (
              <SettingsFact label="걸음 수 기준" value="—" divider />
            ) : (
              <SliderRow
                label="걸음 수 기준"
                unit="보"
                minimumValue={10}
                maximumValue={100}
                step={10}
                value={diagnostics.thresholdSteps}
                onChange={(next) => void setThresholdSteps(next)}
                disabled={phase === 'loading'}
              />
            )}
            {diagnostics === null ? (
              <SettingsFact label="종료 판단 대기 시간" value="—" divider />
            ) : (
              <SliderRow
                label="종료 판단 대기 시간"
                unit="초"
                minimumValue={60}
                maximumValue={300}
                step={30}
                value={Math.round(diagnostics.endDebounceSeconds)}
                onChange={(next) => void setEndDebounceSeconds(next)}
                disabled={phase === 'loading'}
              />
            )}
            {diagnostics === null ? (
              <SettingsFact label="재알림 간격" value="—" divider />
            ) : (
              <SliderRow
                label="재알림 간격"
                unit="초"
                minimumValue={60}
                maximumValue={600}
                step={60}
                value={Math.round(diagnostics.cooldownSeconds)}
                onChange={(next) => void setCooldownSeconds(next)}
                disabled={phase === 'loading'}
              />
            )}
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
          감지 방식은 앱에 고정되어 있어요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
