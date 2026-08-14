import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';

import { LIMITS } from '@/api/types';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { IcBell, IcShield, IcWalk } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { SettingsRow, SettingsSection } from '@/components/settings-ui';
import { TextField } from '@/components/text-field';
import { Toggle } from '@/components/toggle';
import { colors } from '@/lib/theme';
import { useAuth } from '@/stores/auth-store';
import { useDetection } from '@/stores/detection-store';

/**
 * 설정 (prototype SettingsScreen, App.tsx 2053-2148).
 *
 * Two departures from the prototype, both forced by the backend:
 * - the profile card's second line is `@{loginId}`, not an email — the `users`
 *   table has no email column;
 * - the avatar is static. Profile images are excluded from the MVP
 *   (data-tables.md 761), so the prototype's camera-badge file input would
 *   have nothing to upload to.
 *
 * Nickname editing is entirely new: the prototype has no such field. All of
 * its copy is derived and flagged for team review.
 *
 * This screen also carries the app's only entry point to /debug. The phone has
 * no address bar, so removing that link makes on-device diagnostics
 * unreachable — it must survive every redesign of this screen.
 */
export default function SettingsScreen() {
  const user = useAuth((state) => state.user);
  const nicknamePhase = useAuth((state) => state.nicknamePhase);
  const nicknameError = useAuth((state) => state.nicknameError);
  const updateNickname = useAuth((state) => state.updateNickname);
  const signOut = useAuth((state) => state.signOut);

  const notificationsEnabled = useDetection((state) => state.notificationsEnabled);
  const detectionPhase = useDetection((state) => state.phase);
  const setNotificationsEnabled = useDetection((state) => state.setNotificationsEnabled);

  const [editing, setEditing] = useState(false);
  const [draftNickname, setDraftNickname] = useState('');

  const saving = nicknamePhase === 'saving';
  const detectionUnavailable = detectionPhase === 'unavailable';

  const startEditing = () => {
    setDraftNickname(user?.nickname ?? '');
    setEditing(true);
  };

  const commitNickname = () => {
    void updateNickname(draftNickname).then((ok) => {
      if (ok) setEditing(false);
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader title="설정" onBack={() => router.back()} />

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-8">
        {/* Profile */}
        <View className="mb-5 rounded-2xl border border-line bg-white p-4">
          {editing ? (
            <>
              <TextField
                label="닉네임"
                value={draftNickname}
                onChangeText={setDraftNickname}
                placeholder="닉네임을 입력하세요"
                maxLength={LIMITS.nicknameMaxLength}
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={commitNickname}
              />
              {nicknameError !== null ? (
                <Text className="mt-2 text-xs text-red-500">{nicknameError}</Text>
              ) : null}
              <View className="mt-3 flex-row gap-2">
                <SecondaryButton
                  className="flex-1"
                  label="취소"
                  disabled={saving}
                  onPress={() => setEditing(false)}
                />
                <PrimaryButton
                  className="flex-1"
                  label={saving ? '저장 중…' : '저장'}
                  disabled={saving}
                  onPress={commitNickname}
                />
              </View>
            </>
          ) : (
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-full border-2 border-sage bg-sage-pale">
                <Text style={{ fontSize: 22 }}>🌿</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-ink">
                  {user?.nickname ?? '나의 기록장'}
                </Text>
                <Text className="text-xs text-ink-muted">
                  {user === null ? '프로필을 불러오지 못했어요' : `@${user.loginId}`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="닉네임 수정"
                disabled={user === null}
                onPress={startEditing}
                className={`rounded-lg border border-line px-3 py-1.5 active:opacity-60 ${
                  user === null ? 'opacity-40' : ''
                }`}>
                <Text className="text-xs font-medium text-ink-muted">수정</Text>
              </Pressable>
            </View>
          )}
        </View>

        <SettingsSection title="산책 감지">
          <SettingsRow
            icon={<IcWalk size={18} color={colors.sageDark} />}
            title="자동 감지 설정"
            subtitle="걷기 활동 인식과 감지 상태"
            onPress={() => router.push('/settings/detection')}
            divider
          />
          <SettingsRow
            icon={<IcBell size={18} color={colors.inkMid} />}
            tileClassName="bg-amber-pale"
            title="기록 제안 알림"
            subtitle={
              detectionUnavailable ? '이 기능은 iOS 앱에서만 동작해요' : '산책 후 일기 작성 유도'
            }
            right={
              <Toggle
                accessibilityLabel="기록 제안 알림"
                value={notificationsEnabled}
                disabled={detectionUnavailable || detectionPhase === 'loading'}
                onValueChange={(next) => void setNotificationsEnabled(next)}
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="권한 및 개인정보">
          <SettingsRow
            icon={<IcShield size={18} color={colors.inkMid} />}
            tileClassName="bg-indigo-pale"
            title="권한 관리"
            subtitle="위치, 동작, 알림 권한 상태"
            onPress={() => router.push('/settings/permissions')}
          />
        </SettingsSection>

        <SettingsSection title="계정">
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="px-4 py-4 active:bg-parchment">
            <Text className="text-sm font-medium text-red-500">로그아웃</Text>
          </Pressable>
        </SettingsSection>

        <Text className="mt-1 text-center text-xs text-ink-subtle">Mowa v0.1.0</Text>

        {/*
          The app's only navigable route to /debug. See the header comment —
          the phone has no address bar.
        */}
        <Link href="/debug" asChild>
          <Pressable accessibilityRole="link" className="mt-6 py-3 active:opacity-70">
            <Text className="text-center text-xs font-medium text-ink-subtle">개발자 진단 열기</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}
