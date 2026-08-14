import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { LIMITS } from '@/api/types';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ScreenHeader } from '@/components/screen-header';
import { colors } from '@/lib/theme';
import { useDiaryFlow } from '@/stores/diary-flow-store';

/**
 * Diary flow step 5 — edit before saving (prototype EditMemoryScreen).
 *
 * Local state mirrors the prototype: the store is only written on 변경사항 저장,
 * so 취소 discards everything. Tags are one space-separated field; the store's
 * applyEdit normalizes them (strips '#', drops empties and duplicates), and
 * save() enforces the server limits client-side first.
 */
export default function DiaryEditScreen() {
  const walk = useDiaryFlow((state) => state.walk);
  const phase = useDiaryFlow((state) => state.generationPhase);
  const storedTitle = useDiaryFlow((state) => state.title);
  const storedBody = useDiaryFlow((state) => state.body);
  const storedTags = useDiaryFlow((state) => state.tags);
  const savePhase = useDiaryFlow((state) => state.savePhase);
  const saveError = useDiaryFlow((state) => state.saveError);
  const experienceId = useDiaryFlow((state) => state.experienceId);
  const applyEditAndSave = useDiaryFlow((state) => state.applyEditAndSave);
  const clearSaveError = useDiaryFlow((state) => state.clearSaveError);

  const [title, setTitle] = useState(storedTitle);
  const [body, setBody] = useState(storedBody);
  const [tagsInput, setTagsInput] = useState(storedTags.map((tag) => `#${tag}`).join(' '));

  if (walk === null) return <Redirect href="/" />;
  // Declarative post-save navigation + ghost re-edit guard, like the preview.
  if (experienceId !== null) return <Redirect href="/diary/done" />;
  if (phase !== 'success') return <Redirect href="/diary/generating" />;

  const saving = savePhase === 'saving';
  const titleEmpty = title.trim().length === 0;

  return (
    <SafeAreaView className="flex-1 bg-parchment">
      <ScreenHeader title="기억 수정하기" onBack={() => router.back()} />

      <ScrollView className="flex-1 px-5 pt-2" contentContainerClassName="pb-6">
        <View className="mb-5">
          <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            제목
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={LIMITS.titleMaxLength}
            className="rounded-xl border border-line bg-white px-4 py-3.5 text-[17px] text-ink"
            placeholderTextColor={colors.inkSubtle}
          />
        </View>

        <View className="mb-5">
          <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            일기
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            className="h-44 rounded-xl border border-line bg-white px-4 py-3.5 text-sm leading-relaxed text-ink"
            placeholderTextColor={colors.inkSubtle}
          />
        </View>

        <View className="mb-6">
          <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            태그
          </Text>
          <TextInput
            value={tagsInput}
            onChangeText={setTagsInput}
            autoCapitalize="none"
            placeholder="#태그를 띄어쓰기로 구분하세요"
            className="rounded-xl border border-line bg-white px-4 py-3.5 text-sm text-ink"
            placeholderTextColor={colors.inkSubtle}
          />
          <Text className="mt-1.5 text-xs text-ink-subtle">띄어쓰기로 태그를 구분해요</Text>
        </View>

        {saveError !== null ? (
          <Text className="mb-3 text-center text-xs text-red-500">{saveError}</Text>
        ) : null}

        <View className="flex-row">
          <SecondaryButton
            className="flex-1"
            disabled={saving}
            label="취소"
            onPress={() => {
              clearSaveError();
              router.back();
            }}
          />
          <View className="w-3" />
          <PrimaryButton
            className="flex-1"
            disabled={saving || titleEmpty}
            label={saving ? '저장 중…' : '변경사항 저장'}
            onPress={() => void applyEditAndSave({ title, body, tagsInput })}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
