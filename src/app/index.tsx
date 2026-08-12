import { useCallback, useEffect } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  health,
  location,
  notifications,
  storage,
  walkDetector,
  type AdapterResult,
} from '@/adapters';
import { useDiagnostics } from '@/stores/diagnostics-store';

/**
 * Environment smoke screen.
 *
 * Verifies the scaffold end to end: each permission is requested by its own
 * button (iOS grants are staged and one-shot, so a batch request would be
 * untestable), the JS <-> Swift bridge is proven with values only native can
 * know, and the event path is proven with a synthetic emit.
 *
 * Throwaway — delete once real screens land.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-200 py-2">
      <Text className="text-sm text-neutral-600">{label}</Text>
      <Text className="ml-3 flex-shrink text-right font-mono text-sm text-neutral-900">
        {value}
      </Text>
    </View>
  );
}

function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-2 rounded-lg bg-walk px-4 py-3 active:opacity-70">
      <Text className="text-center text-sm font-semibold text-white">{title}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6 rounded-xl bg-white p-4">
      <Text className="mb-2 text-base font-bold text-neutral-900">{title}</Text>
      {children}
    </View>
  );
}

export default function SmokeScreen() {
  const state = useDiagnostics();
  const { append, set } = state;

  /** Unwraps an AdapterResult into the log, returning the value on success. */
  const run = useCallback(
    async <T,>(label: string, call: Promise<AdapterResult<T>>): Promise<T | null> => {
      const result = await call;
      if (result.ok) {
        append(`${label}: ok ${JSON.stringify(result.value)}`);
        return result.value;
      }
      append(`${label}: FAILED — ${result.error}`);
      return null;
    },
    [append],
  );

  // Read current state without prompting, on mount.
  useEffect(() => {
    void (async () => {
      const loc = await run('location.getPermission', location.getPermission());
      if (loc) set('locationPermission', loc);

      const notif = await run('notifications.getPermission', notifications.getPermission());
      if (notif) set('notificationPermission', notif);

      const hk = await run('health.getStatus', health.getStatus());
      if (hk) {
        set('healthAvailable', hk.isHealthDataAvailable);
        set('healthAuthorization', hk.authorization);
      }

      await run('storage.init', storage.init());
    })();
  }, [run, set]);

  // Native -> JS event path.
  useEffect(() => {
    const unsubscribe = walkDetector.subscribe((event) => {
      set('lastEvent', event);
      append(`onWalkDetected received (${event.source})`);
    });
    return unsubscribe;
  }, [append, set]);

  const nativeAvailable = walkDetector.isAvailable;

  return (
    <SafeAreaView className="flex-1 bg-neutral-100">
      <ScrollView contentContainerClassName="p-4">
        <Text className="mb-1 text-2xl font-bold text-neutral-900">Mowa</Text>
        <Text className="mb-6 text-sm text-neutral-500">
          Environment smoke test · {Platform.OS}
        </Text>

        {!nativeAvailable && (
          <View className="mb-6 rounded-xl bg-amber-100 p-4">
            <Text className="text-sm text-amber-900">
              Native features are unavailable on web. Walk detection, HealthKit, notifications
              and background location are iOS-only; this build shows mock values instead.
            </Text>
          </View>
        )}

        <Section title="1 · Permissions">
          <Row label="Motion & Fitness" value={state.diagnostics?.motionAuthorization ?? '—'} />
          <Button
            title="Request Motion (via WalkDetector.start)"
            onPress={async () => {
              await run('walkDetector.start', walkDetector.start());
              const d = await run('walkDetector.getDiagnostics', walkDetector.getDiagnostics());
              if (d) set('diagnostics', d);
            }}
          />

          <View className="h-4" />
          <Row label="Location (When In Use)" value={state.locationPermission.foreground} />
          <Row label="Location (Always)" value={state.locationPermission.background} />
          <Button
            title="Step 1 — Request When In Use"
            onPress={async () => {
              const v = await run(
                'location.requestForegroundPermission',
                location.requestForegroundPermission(),
              );
              if (v) set('locationPermission', v);
            }}
          />
          <Button
            title="Step 2 — Upgrade to Always"
            onPress={async () => {
              const v = await run(
                'location.requestBackgroundPermission',
                location.requestBackgroundPermission(),
              );
              if (v) set('locationPermission', v);
            }}
          />

          <View className="h-4" />
          <Row label="Notifications" value={state.notificationPermission} />
          <Button
            title="Request Notifications"
            onPress={async () => {
              const v = await run(
                'notifications.requestPermission',
                notifications.requestPermission(),
              );
              if (v) set('notificationPermission', v);
            }}
          />
        </Section>

        <Section title="2 · HealthKit (runtime verification)">
          <Row
            label="isHealthDataAvailable()"
            value={state.healthAvailable === null ? '—' : String(state.healthAvailable)}
          />
          {/* This is the SHARE (write) status. We request read-only, so "denied"
              here is the expected, correct result — not a failure. */}
          <Row label="share status (read never disclosed)" value={state.healthAuthorization} />
          <Row label="Result" value={state.healthResult ?? '—'} />
          <Button
            title="Request HealthKit authorization (read: stepCount)"
            onPress={async () => {
              const result = await health.requestAuthorization();
              if (result.ok) {
                set('healthAvailable', result.value.isHealthDataAvailable);
                set('healthAuthorization', result.value.authorization);
                set('healthResult', 'authorization request succeeded');
                append('health.requestAuthorization: ok');
              } else {
                set('healthResult', result.error);
                append(`health.requestAuthorization: FAILED — ${result.error}`);
              }
            }}
          />
          <Button
            title="Read today's step count"
            onPress={async () => {
              const steps = await run('health.getStepCountToday', health.getStepCountToday());
              if (steps !== null) set('healthResult', `steps today: ${steps}`);
            }}
          />
          <Text className="mt-2 text-xs text-neutral-500">
            HealthKit never reports read permission, so an empty result does not mean denied.
            The permission sheet appears only once per install.
          </Text>
        </Section>

        <Section title="3 · Native bridge">
          <Row
            label="isPedometerAvailable"
            value={state.diagnostics ? String(state.diagnostics.isPedometerAvailable) : '—'}
          />
          <Row
            label="isActivityAvailable"
            value={state.diagnostics ? String(state.diagnostics.isActivityAvailable) : '—'}
          />
          <Row
            label="isSimulator"
            value={state.diagnostics ? String(state.diagnostics.isSimulator) : '—'}
          />
          <Row label="systemVersion" value={state.diagnostics?.systemVersion ?? '—'} />
          <Row
            label="isRunning"
            value={state.diagnostics ? String(state.diagnostics.isRunning) : '—'}
          />
          <Button
            title="getDiagnostics()"
            onPress={async () => {
              const d = await run('walkDetector.getDiagnostics', walkDetector.getDiagnostics());
              if (d) set('diagnostics', d);
            }}
          />

          <View className="h-4" />
          <Row label="queryHistory() rows" value={String(state.history.length)} />
          {state.history.map((walk) => (
            <Row key={walk.id} label={walk.id} value={`${walk.steps} steps · ${walk.source}`} />
          ))}
          <Button
            title="queryHistory(last 24h)"
            onPress={async () => {
              const rows = await run(
                'walkDetector.queryHistory',
                walkDetector.queryHistory(Date.now() - 24 * 60 * 60 * 1000),
              );
              if (rows) set('history', rows);
            }}
          />

          <View className="h-4" />
          <Row
            label="last onWalkDetected"
            value={state.lastEvent ? `${state.lastEvent.id.slice(0, 8)}…` : 'none yet'}
          />
          <Button
            title="emitTestEvent() — fire onWalkDetected"
            onPress={() => void run('walkDetector.emitTestEvent', walkDetector.emitTestEvent())}
          />
        </Section>

        <Section title="4 · Storage">
          <Row label="persistent" value={String(storage.isPersistent)} />
          <Button
            title="Insert + list a walk"
            onPress={async () => {
              await run(
                'storage.insertWalk',
                storage.insertWalk({
                  id: `walk-${Date.now()}`,
                  startedAtMs: Date.now(),
                  endedAtMs: null,
                  steps: 1234,
                  note: null,
                }),
              );
              const rows = await run('storage.listWalks', storage.listWalks());
              if (rows) append(`storage rows: ${rows.length}`);
            }}
          />
        </Section>

        <Section title="Log">
          {state.log.length === 0 ? (
            <Text className="text-sm text-neutral-400">No calls yet.</Text>
          ) : (
            state.log.map((line, i) => (
              <Text key={i} className="font-mono text-xs text-neutral-700">
                {line}
              </Text>
            ))
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
