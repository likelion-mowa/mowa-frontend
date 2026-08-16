import type { PickedPhoto } from '@/adapters/types';

type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

type UploadFormData = FormData & {
  append(name: string, value: string): void;
  append(name: string, value: Blob, fileName?: string): void;
  append(name: string, value: ReactNativeFilePart): void;
};

type CloudinaryUploadResponse = {
  secure_url?: unknown;
  error?: {
    message?: unknown;
  };
};

const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;

function requireConfig(): { cloudName: string; uploadPreset: string } {
  const cloudName = CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = CLOUDINARY_UPLOAD_PRESET?.trim();

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary upload is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.',
    );
  }

  return { cloudName, uploadPreset };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extensionFromMimeType(mimeType: string | null | undefined): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

function cleanFileName(fileName: string | null | undefined, mimeType: string | null | undefined): string {
  const fallback = `mowa-photo-${Date.now()}.${extensionFromMimeType(mimeType)}`;
  const trimmed = fileName?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/[^\w.-]+/g, '-');
}

function cloudinaryErrorMessage(response: CloudinaryUploadResponse): string | null {
  const message = response.error?.message;
  return typeof message === 'string' && message.length > 0 ? message : null;
}

export function isHttpsUrl(value: string | null): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}

export function isLocalPreviewUrl(value: string | null): value is string {
  return typeof value === 'string' && (value.startsWith('file://') || value.startsWith('blob:'));
}

function appendPhotoFile(formData: UploadFormData, source: PickedPhoto | string): void {
  if (typeof source === 'string') {
    if (!isHttpsUrl(source)) {
      throw new Error('Only HTTPS image URLs can be uploaded by URL.');
    }
    formData.append('file', source);
    return;
  }

  if (source.file !== undefined) {
    formData.append('file', source.file, source.file.name);
    return;
  }

  if (isHttpsUrl(source.uri)) {
    formData.append('file', source.uri);
    return;
  }

  formData.append('file', {
    uri: source.uri,
    name: cleanFileName(source.fileName, source.mimeType),
    type: source.mimeType ?? 'image/jpeg',
  });
}

export async function uploadPhotoToCloudinary(source: PickedPhoto | string): Promise<string> {
  const { cloudName, uploadPreset } = requireConfig();
  const formData = new FormData() as UploadFormData;
  appendPhotoFile(formData, source);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  const parsed: CloudinaryUploadResponse = isRecord(json) ? json : {};
  if (!response.ok) {
    throw new Error(
      `Cloudinary upload failed (${response.status}): ${cloudinaryErrorMessage(parsed) ?? 'non-JSON response'}`,
    );
  }

  if (typeof parsed.secure_url !== 'string' || !isHttpsUrl(parsed.secure_url)) {
    throw new Error('Cloudinary upload succeeded without an HTTPS secure_url.');
  }

  return parsed.secure_url;
}
