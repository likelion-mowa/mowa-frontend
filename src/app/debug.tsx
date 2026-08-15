import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import {
  SECURE_KEYS,
  health,
  location,
  notifications,
  secureStore,
  storage,
  walkDetector,
  type AdapterResult,
} from '@/adapters';
import { setAccessToken } from '@/api/client';
import {
  COMPANION_LABELS,
  COMPANIONS,
  EMOTION_LABELS,
  EMOTIONS,
  SITUATION_LABELS,
  SITUATIONS,
  endpoints,
  type ListWalkExperiencesQuery,
} from '@/api/types';
import { kstMonthRange, kstNow, kstYearRange } from '@/lib/kst';
import { useAuth } from '@/stores/auth-store';
import { useDiagnostics } from '@/stores/diagnostics-store';
import { useDiaryFlow } from '@/stores/diary-flow-store';
import { useExperiences } from '@/stores/experience-store';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

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

/** Sensor liveness reads better as "how long ago" than as a wall clock. */
function agoLabel(epochMs: number | null): string {
  if (epochMs === null) return 'never';
  return `${Math.max(0, Math.round((Date.now() - epochMs) / 1000))}s ago`;
}

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
  const auth = useAuth();
  const flow = useWalkCandidateFlow();
  const diary = useDiaryFlow();
  const experiences = useExperiences();
  const [probeLines, setProbeLines] = useState<string[]>([]);

  const runProbe = async (query: ListWalkExperiencesQuery) => {
    const result = await experiences.probeListQuery(query);
    const outcome =
      result.error === null
        ? `200 · ${result.count}건`
        : `${result.status ?? 'network'} · ${result.error}`;
    setProbeLines((lines) => [`${JSON.stringify(query)} → ${outcome}`, ...lines].slice(0, 12));
  };

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
              Walk detection, HealthKit, notifications and background location are iOS-only.
              On web those adapters report unavailable rather than returning fake data, so the
              calls below are expected to fail here. Storage is the exception: it is backed by
              localStorage and works.
            </Text>
          </View>
        )}

        <Section title="1 · Permissions">
          <Row label="Motion & Fitness" value={state.diagnostics?.motionAuthorization ?? '—'} />
          <Button
            title="Start (default: layered) — requests Motion"
            onPress={async () => {
              await run('walkDetector.start', walkDetector.start());
              const d = await run('walkDetector.getDiagnostics', walkDetector.getDiagnostics());
              if (d) set('diagnostics', d);
            }}
          />
          <Button
            title="Start (healthkit-observer) — unmeasured"
            onPress={async () => {
              await run(
                "walkDetector.start('healthkit-observer')",
                walkDetector.start('healthkit-observer'),
              );
              const d = await run('walkDetector.getDiagnostics', walkDetector.getDiagnostics());
              if (d) set('diagnostics', d);
            }}
          />
          <Button
            title="Start (layered) — keepalive + observer net"
            onPress={async () => {
              await run("walkDetector.start('layered')", walkDetector.start('layered'));
              const d = await run('walkDetector.getDiagnostics', walkDetector.getDiagnostics());
              if (d) set('diagnostics', d);
            }}
          />
          <Button
            title="Stop detector"
            onPress={async () => {
              await run('walkDetector.stop', walkDetector.stop());
              const d = await run('walkDetector.getDiagnostics', walkDetector.getDiagnostics());
              if (d) set('diagnostics', d);
            }}
          />
          <Text className="mt-2 text-xs text-neutral-500">
            start() silences any previously running mechanism before starting the new one,
            so switching needs no separate Stop. The first observer/layered start raises
            the HealthKit read sheet.
          </Text>

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
          <Row label="mechanism" value={state.diagnostics?.mechanism ?? '—'} />
          <Row
            label="locationAuthorization"
            value={state.diagnostics?.locationAuthorization ?? '—'}
          />
          {/*
            Read back from the Core's own UserDefaults, so this is the only
            place that proves 설정 > 기록 제안 알림 actually crossed the bridge.
            The settings toggle's position comes from the JS-side KV copy and
            would look right even if the Swift write never landed.
          */}
          <Row
            label="notificationsEnabled (native)"
            value={state.diagnostics ? String(state.diagnostics.notificationsEnabled) : '—'}
          />
          {/*
            The HealthKit safety net leaves no other trace in the app: it posts
            its notification natively and emits no JS event. Without this row,
            confirming a fire means pulling os_log off the phone with
            `log collect`. 'never' is honest — the key is unwritten until the
            observer has fired once on this install.
          */}
          <Row
            label="observer last fired"
            value={state.diagnostics ? agoLabel(state.diagnostics.lastObserverFiredAtMs) : '—'}
          />
          <Row
            label="warnings"
            value={state.diagnostics ? String(state.diagnostics.warnings.length) : '—'}
          />
          {state.diagnostics?.warnings.map((warning) => (
            <Text key={warning} className="mt-1 text-xs text-amber-700">
              {warning}
            </Text>
          ))}
          <Button
            title="getDiagnostics()"
            onPress={async () => {
              const d = await run('walkDetector.getDiagnostics', walkDetector.getDiagnostics());
              if (d) set('diagnostics', d);
            }}
          />

          <View className="h-4" />
          <Text className="mb-1 text-xs font-semibold text-neutral-500">
            walk session — why detection is quiet
          </Text>
          <Row
            label="activity / confidence"
            value={
              state.diagnostics
                ? `${state.diagnostics.activity} / ${state.diagnostics.confidence}`
                : '—'
            }
          />
          <Row
            label="last activity callback"
            value={agoLabel(state.diagnostics?.lastActivityAtMs ?? null)}
          />
          <Row
            label="last pedometer callback"
            value={agoLabel(state.diagnostics?.lastPedometerAtMs ?? null)}
          />
          <Row
            label="walk session"
            value={
              state.diagnostics
                ? state.diagnostics.walkActive
                  ? `active · ${state.diagnostics.walkSteps} steps${state.diagnostics.walkQualified ? ' · qualified' : ''}`
                  : 'none'
                : '—'
            }
          />
          <Row
            label="ending in"
            value={
              state.diagnostics == null || state.diagnostics.stationarySinceMs == null
                ? '—'
                : `${Math.max(
                    0,
                    Math.round(
                      state.diagnostics.endDebounceSeconds -
                        (Date.now() - state.diagnostics.stationarySinceMs) / 1000,
                    ),
                  )}s`
            }
          />
          <Row
            label="total steps since start"
            value={state.diagnostics ? String(state.diagnostics.currentSteps) : '—'}
          />

          <View className="h-4" />
          <Row label="queryHistory() rows" value={String(state.history.length)} />
          {state.history.map((walk) => (
            <Row
              key={walk.id}
              label={walk.id}
              value={[
                `${walk.steps} steps`,
                walk.source,
                // Optional Swift-side fields: rendering them here is the only
                // verification the payload shape gets (no gate covers it).
                walk.distanceMeters != null ? `${Math.round(walk.distanceMeters)}m` : null,
                walk.confidence ?? null,
              ]
                .filter((part): part is string => part !== null)
                .join(' · ')}
            />
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
                  locationSummary: null,
                  candidateId: null,
                }),
              );
              const rows = await run('storage.listWalks', storage.listWalks());
              if (rows) append(`storage rows: ${rows.length}`);
            }}
          />
        </Section>

        {/*
          Renders the code values straight from src/api/types.ts. This exists so
          the contract module is actually reachable from the web graph — an
          unimported types file compiles clean and ships nothing, which the
          bundle grep would then have no way to check.
        */}
        <Section title="5 · Backend contract">
          <Row label="base path" value={endpoints.walkExperiences()} />
          <Row
            label="companion"
            value={COMPANIONS.map((c) => `${c}=${COMPANION_LABELS[c]}`).join(' ')}
          />
          <Row
            label="emotion"
            value={EMOTIONS.map((e) => `${e}=${EMOTION_LABELS[e]}`).join(' ')}
          />
          <Row
            label="situation"
            value={SITUATIONS.map((s) => `${s}=${SITUATION_LABELS[s]}`).join(' ')}
          />
        </Section>

        <Section title="6 · Candidate flow (POST /walk-candidates)">
          <Row label="auth" value={auth.status} />
          <Row label="user" value={auth.user ? `${auth.user.loginId} (${auth.user.nickname})` : '—'} />
          <Row
            label="last detection"
            value={
              flow.lastDetection
                ? `${flow.lastDetection.id.slice(0, 14)}… steps=${flow.lastDetection.steps}`
                : '—'
            }
          />
          <Row label="last candidateId" value={flow.lastDetection?.candidateId ?? '—'} />
          <Button
            title="Mock login (env creds)"
            onPress={() => void auth.devSignInWithEnvCredentials()}
          />
          {/*
            The mock's tokens never expire (mock/README.md), so the 401 →
            discard → re-login path cannot occur naturally. Planting the same
            bogus token the contract test uses is the only way to exercise it.
          */}
          <Button
            title="Plant bogus token (force 401)"
            onPress={() => {
              setAccessToken('mock.does-not-exist');
              void secureStore.setItem(SECURE_KEYS.authToken, 'mock.does-not-exist');
            }}
          />
          <Button title="Sign out" onPress={() => void auth.signOut()} />
          <Button
            title="Synthetic walk event (JS) → flow"
            onPress={() =>
              void flow.handleWalkEvent({
                id: `debug-${Date.now()}`,
                startedAtMs: Date.now(),
                endedAtMs: null,
                steps: 0,
                source: 'stub',
              })
            }
          />
          <Button
            title="Synthetic FINISHED walk (20 min, with end)"
            onPress={() => {
              const endedAtMs = Date.now();
              void flow.handleWalkEvent({
                id: `debug-${endedAtMs}`,
                startedAtMs: endedAtMs - 20 * 60 * 1000,
                endedAtMs,
                steps: 1200,
                source: 'stub',
              });
            }}
          />
          <Link href="/walk" asChild>
            <Pressable className="mt-2 rounded-lg bg-neutral-200 px-4 py-3 active:opacity-70">
              <Text className="text-center text-sm font-semibold text-neutral-600">
                Open /walk — suggestion screen
              </Text>
            </Pressable>
          </Link>
          <Text className="mt-2 text-xs text-neutral-500">
            Calls the store handler directly, so it works on web too. On iOS,
            emitTestEvent above reaches the same flow through the real subscription.
            The /walk link is the only way to re-enter the suggestion screen without
            walking again — a tapped notification is gone from Notification Center.
            The second button is the shape a real detection now has — the detector
            fires once, after the walk ended — so it exercises the end-value PATCH
            that a walk-less environment otherwise cannot reach.
          </Text>
          {flow.log.map((line, i) => (
            <Text key={i} className="font-mono text-xs text-neutral-700">
              {line}
            </Text>
          ))}
        </Section>

        <Section title="7 · Diary flow (drafts + AI generation)">
          <Row label="draftId" value={diary.draftId ?? '—'} />
          <Row label="generation" value={diary.generationPhase} />
          <Row label="experienceId" value={diary.experienceId ?? '—'} />
          <Row label="force AI failure" value={diary.forceAiFailure ? 'ON' : 'off'} />
          <Button
            title={`Force AI failure: turn ${diary.forceAiFailure ? 'OFF' : 'ON'}`}
            onPress={() => diary.setForceAiFailure(!diary.forceAiFailure)}
          />
          <Text className="mt-2 text-xs text-neutral-500">
            The toggle makes the next AI generation send the mock&apos;s ?fail=1 switch —
            the only way to see the FAILED branch in-app, because the mock&apos;s
            generation is deterministic and instant. Product code never sets it.
          </Text>
          {diary.log.map((line, i) => (
            <Text key={i} className="font-mono text-xs text-neutral-700">
              {line}
            </Text>
          ))}
        </Section>

        <Section title="8 · Archive list (GET /walk-experiences)">
          <Row label="list phase" value={experiences.listPhase} />
          <Row label="rows" value={String(experiences.items.length)} />
          <Row
            label="durationSeconds"
            value={
              experiences.items.length === 0
                ? '—'
                : experiences.items.every((item) => item.durationSeconds != null)
                  ? '제공됨'
                  : '미제공 (누적 시간 —)'
            }
          />
          <Button title="Load list (no query)" onPress={() => void experiences.loadList()} />
          <Button
            title="Probe: this month (from/to)"
            onPress={() => {
              const now = kstNow(Date.now());
              void runProbe(kstMonthRange(now.year, now.month));
            }}
          />
          <Button
            title="Probe: this year (from/to)"
            onPress={() => void runProbe(kstYearRange(kstNow(Date.now()).year))}
          />
          <Button
            title="Probe: first tag of first row"
            onPress={() => {
              const tag = experiences.items[0]?.tags[0];
              if (tag === undefined) {
                setProbeLines((lines) => ['태그가 있는 행이 없습니다 — 먼저 목록을 불러오세요', ...lines]);
                return;
              }
              void runProbe({ tag });
            }}
          />
          <Button
            title="Guard: from only (no round trip)"
            onPress={() => void runProbe({ from: '2026-08-01' })}
          />
          <Button
            title="Guard: range + tag (no round trip)"
            onPress={() => void runProbe({ from: '2026-08-01', to: '2026-08-31', tag: '망원동' })}
          />
          <Text className="mt-2 text-xs text-neutral-500">
            The archive filters its period tabs in memory — the MVP has no pagination and
            the stats need every row anyway — so this section is where the endpoint&apos;s
            from/to/tag parameters actually run. The two Guard buttons never reach the
            server: `isValidListQuery` rejects them client-side, which is why they report
            400 instantly. The server&apos;s own four 400s are covered by
            `npm run mock:test`.
          </Text>
          {probeLines.map((line, i) => (
            <Text key={i} className="font-mono text-xs text-neutral-700">
              {line}
            </Text>
          ))}
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
