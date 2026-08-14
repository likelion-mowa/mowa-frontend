import { useEffect } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { PrimaryButton } from '@/components/buttons';
import { IcCamera, IcClose, IcGallery } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { colors } from '@/lib/theme';
import { useDiaryFlow } from '@/stores/diary-flow-store';
import { useWalkCandidateFlow } from '@/stores/walk-candidate-store';

/**
 * Diary flow step 1 — photo (prototype CreatePhotoScreen). Entry point of the
 * flow: /walk redirects here once 저장할게요 has made the candidate RECORDING.
 *
 * The back chevron leaves for home, not /walk — a RECORDING candidate makes
 * /walk redirect right back here, which would loop. Leaving abandons the flow
 * (logged in the store); the draft, if one exists already, stays on the server
 * by spec.
 */
export default function DiaryPhotoScreen() {
  const active = useWalkCandidateFlow((state) => state.activeCandidate);
  const walk = useDiaryFlow((state) => state.walk);
  const beginFlow = useDiaryFlow((state) => state.beginFlow);
  const photoUri = useDiaryFlow((state) => state.photoUri);
  const setPhoto = useDiaryFlow((state) => state.setPhoto);
  const pickPhotoFromLibrary = useDiaryFlow((state) => state.pickPhotoFromLibrary);
  const capturePhotoWithCamera = useDiaryFlow((state) => state.capturePhotoWithCamera);

  const canStart = active !== null && active.serverStatus === 'RECORDING';
  useEffect(() => {
    if (canStart) beginFlow(active);
  }, [canStart, active, beginFlow]);

  // Nothing to write a diary about: direct URL entry (web) or a lost session.
  if (walk === null && !canStart) {
    return <Redirect href="/" />;
  }
  if (walk === null) {
    return <SafeAreaView className="flex-1 bg-parchment" />;
  }

  const sources = [
    { label: '카메라', sub: '지금 촬영하기', icon: IcCamera, onPress: capturePhotoWithCamera },
    { label: '갤러리', sub: '앨범에서 선택', icon: IcGallery, onPress: pickPhotoFromLibrary },
  ];

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader
        onBack={() => router.replace('/')}
        center={
          <View className="flex-row items-center">
            <View className="h-1.5 w-7 rounded-full bg-sage" />
            <View className="ml-2 h-1.5 w-3 rounded-full bg-parchment-dark" />
          </View>
        }
      />

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-6">
        {/* Prototype display headline — regular weight, not bold. */}
        <Text className="mb-1.5 text-xl text-ink">사진이 있나요?</Text>
        <Text className="mb-6 text-sm leading-relaxed text-ink-muted">
          산책 중 찍은 사진이 있다면 함께 저장할 수 있어요.
        </Text>

        {photoUri !== null ? (
          <View className="relative mb-5">
            <View className="h-56 w-full overflow-hidden rounded-2xl bg-parchment-dark">
              <Image
                source={{ uri: photoUri }}
                className="h-full w-full"
                resizeMode="cover"
                accessibilityLabel="산책 사진"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPhoto(null)}
              className="absolute right-3 top-3 h-7 w-7 items-center justify-center rounded-full bg-black/50 active:opacity-70">
              <IcClose size={14} color={colors.white} />
            </Pressable>
          </View>
        ) : (
          <View className="mb-5 flex-row">
            {sources.map((source, index) => (
              <Pressable
                key={source.label}
                accessibilityRole="button"
                onPress={() => void source.onPress()}
                className={`flex-1 items-center rounded-2xl border-2 border-dashed border-line bg-white py-7 active:border-sage ${index > 0 ? 'ml-3' : ''}`}>
                <View className="h-12 w-12 items-center justify-center rounded-full bg-sage-pale">
                  <source.icon size={22} color={colors.sage} />
                </View>
                <Text className="mt-3 text-sm font-medium text-ink">{source.label}</Text>
                <Text className="mt-0.5 text-xs text-ink-subtle">{source.sub}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <PrimaryButton
          label={photoUri !== null ? '이 사진으로 계속하기' : '사진 없이 계속하기'}
          onPress={() => router.push('/diary/context')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
