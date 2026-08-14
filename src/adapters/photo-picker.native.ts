import * as ImagePicker from 'expo-image-picker';

import { toError, type AdapterResult, type PhotoPickerPort, type PickedPhoto } from './types';

/**
 * iOS implementation.
 *
 * The library path uses PHPickerViewController under the hood, which runs out
 * of process — iOS shows no permission prompt for it and none is needed. The
 * camera does need an explicit permission, requested lazily on first use so
 * the prompt appears in context (fresh-install behaviour must be verified on
 * device — iOS shows it exactly once).
 */
function toResult(picked: ImagePicker.ImagePickerResult): AdapterResult<PickedPhoto | null> {
  if (picked.canceled) return { ok: true, value: null };
  const asset = picked.assets?.[0];
  if (asset === undefined) return { ok: false, error: 'Picker returned no asset.' };
  return { ok: true, value: { uri: asset.uri } };
}

const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.8,
};

export const photoPicker: PhotoPickerPort = {
  isAvailable: true,

  async pickFromLibrary() {
    try {
      return toResult(await ImagePicker.launchImageLibraryAsync(OPTIONS));
    } catch (error) {
      return toError(error);
    }
  },

  async getCameraPermission() {
    try {
      // getCameraPermissionsAsync reads; requestCameraPermissionsAsync prompts.
      // The permissions screen must never prompt — iOS shows each dialog once
      // per install, and spending it on a status read would be unrecoverable.
      const permission = await ImagePicker.getCameraPermissionsAsync();
      if (permission.granted) return { ok: true, value: 'granted' as const };
      if (permission.canAskAgain) return { ok: true, value: 'prompt' as const };
      return { ok: true, value: 'denied' as const };
    } catch (error) {
      return toError(error);
    }
  },

  async captureWithCamera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { ok: false, error: '카메라 권한이 없습니다. 설정에서 허용해주세요.' };
      }
      return toResult(await ImagePicker.launchCameraAsync(OPTIONS));
    } catch (error) {
      return toError(error);
    }
  },
};
