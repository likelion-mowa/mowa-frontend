import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { LIMITS } from '@/api/types';
import { PrimaryButton } from '@/components/buttons';
import { IcChevronLeft } from '@/components/icons';
import { TextField } from '@/components/text-field';
import { colors } from '@/lib/theme';
import { useAuth } from '@/stores/auth-store';

/**
 * Login (prototype LoginScreen, src/App.tsx 808-911): a sage field with a
 * parchment sheet riding on top of it.
 *
 * 아이디/비밀번호, not email — the backend's `users` table has `login_id` and
 * no email column at all. The prototype's `IcGoogle` is dead code (defined,
 * never rendered) and the spec has no social login, so there is none here.
 *
 * Navigation on success is deliberately absent: the root layout's gate moves a
 * signed-in user off `/login`. A screen that also navigated would race it.
 */

/**
 * The prototype toggles to a signup form here, but the backend has no signup
 * endpoint — `api-spec.md:1071` says 회원가입은 MVP에서 제외합니다 and the MVP
 * ships pre-created accounts. Showing the notice keeps the prototype's
 * affordance without pretending a form exists. Copy is derived, not from the
 * prototype — flagged for team review.
 */
const SIGNUP_NOTICE = '지금은 미리 준비된 계정으로만 로그인할 수 있어요.';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useAuth((state) => state.signIn);
  const signInPhase = useAuth((state) => state.signInPhase);
  const signInError = useAuth((state) => state.signInError);

  // Dev convenience only. __DEV__ is statically false in a production bundle,
  // so these values cannot ship even if someone sets them at build time.
  const [loginId, setLoginId] = useState(
    __DEV__ ? (process.env.EXPO_PUBLIC_MOCK_LOGIN_ID ?? '') : '',
  );
  const [password, setPassword] = useState(
    __DEV__ ? (process.env.EXPO_PUBLIC_MOCK_PASSWORD ?? '') : '',
  );
  const [signupNoticeShown, setSignupNoticeShown] = useState(false);

  const submitting = signInPhase === 'submitting';
  const canSubmit = loginId.trim().length > 0 && password.length > 0 && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    void signIn({ loginId: loginId.trim(), password });
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // Deep link straight to /login (web URL): there is no history to pop.
    router.replace('/onboarding');
  };

  return (
    <View className="flex-1 bg-sage">
      <SafeAreaView edges={['top']}>
        <View className="h-12 flex-row items-center justify-between px-5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            onPress={goBack}
            className="p-2 active:opacity-60">
            <IcChevronLeft size={22} color={colors.white} />
          </Pressable>

          {/*
            The prototype's glass pill. GlassBarShell is tuned for a dark scrim
            over photos, so a plain translucent pill is used here instead of
            re-tuning shared constants for one screen.
          */}
          <View className="rounded-full border border-white/30 bg-white/20 px-4 py-1.5">
            <Text
              className="font-extrabold text-white"
              style={{ fontSize: 17, letterSpacing: 0.7 }}>
              MOWA
            </Text>
          </View>

          <View className="w-10" />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 overflow-hidden bg-parchment" style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            contentContainerClassName="px-6 pt-7"
            keyboardShouldPersistTaps="handled">
            <Text className="text-[24px] font-bold leading-snug text-ink">반가워요 👋</Text>
            <Text className="mb-7 mt-1 text-sm text-ink-muted">
              로그인하고 산책 기억을 확인해보세요
            </Text>

            <TextField
              className="mb-3"
              label="아이디"
              value={loginId}
              onChangeText={setLoginId}
              placeholder="아이디를 입력하세요"
              maxLength={LIMITS.loginIdMaxLength}
              autoComplete="username"
              editable={!submitting}
              returnKeyType="next"
            />
            <TextField
              className="mb-5"
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호를 입력하세요"
              secureTextEntry
              autoComplete="current-password"
              editable={!submitting}
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            {signInError !== null ? (
              <Text className="mb-3 text-center text-xs text-red-500">{signInError}</Text>
            ) : null}

            <PrimaryButton
              label={submitting ? '로그인 중…' : '로그인'}
              disabled={!canSubmit}
              onPress={submit}
            />

            <View className="mt-5 flex-row items-center justify-center">
              <Text className="text-sm text-ink-muted">처음 사용하시나요? </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSignupNoticeShown((shown) => !shown)}
                className="active:opacity-60">
                <Text className="text-sm font-semibold text-sage">회원가입</Text>
              </Pressable>
            </View>

            {signupNoticeShown ? (
              <View className="mt-3 rounded-xl border border-sage/20 bg-sage-pale/60 px-4 py-3">
                <Text className="text-center text-xs leading-relaxed text-ink-muted">
                  {SIGNUP_NOTICE}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
