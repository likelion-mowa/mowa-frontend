/**
 * The user-editable input of a walk experience, shared by the flow that CREATES
 * one (기능 2~5) and the editor that UPDATES one (기능 8).
 *
 * Both surfaces validate the same title and the same tags against the same
 * server limits, so the rules live here once. A second copy would be exactly
 * the "이중 진실" AGENTS.md warns about: no gate in this repo compares two
 * hand-written validators, so a one-sided edit would ship silently.
 *
 * Platform-free — this imports only the backend contract, no adapters and no
 * native code, so it is safe in the web bundle and on iOS alike.
 */
import {
  LIMITS,
  normalizeTag,
  type Emotion,
  type UpdateWalkExperienceRequest,
  type WalkExperienceDetail,
  type WalkExperienceListItem,
  type Companion,
  type Situation,
} from '@/api/types';

/** Space-separated tag field → normalized, deduplicated tag list. */
export function parseTagsInput(tagsInput: string): string[] {
  const tags = tagsInput
    .split(/\s+/)
    .map(normalizeTag)
    .filter((tag): tag is string => tag !== null);
  return [...new Set(tags)];
}

/** Inverse of `parseTagsInput`: the stored list as the editable `#a #b` field. */
export function formatTagsInput(tags: readonly string[]): string {
  return tags.map((tag) => `#${tag}`).join(' ');
}

/** Mirrors the server's validation so the user gets a message, not a 400. */
export function validateTitleAndTags(title: string, tags: readonly string[]): string | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) return '제목을 입력해주세요.';
  if (trimmed.length > LIMITS.titleMaxLength) {
    return `제목은 ${LIMITS.titleMaxLength}자 이내여야 해요.`;
  }
  if (tags.length > LIMITS.tagsMaxCount) {
    return `태그는 ${LIMITS.tagsMaxCount}개까지 저장할 수 있어요.`;
  }
  return null;
}

/**
 * Web object URLs (blob:) hold their image in memory until revoked; iOS file
 * URIs need no release. Called whenever a photo is replaced or a flow resets.
 *
 * Callers must be sure the URI is theirs to revoke. Persisted `photoUrl`
 * values must be HTTPS Cloudinary URLs; only in-progress web previews should
 * ever be `blob:` URLs.
 */
export function releasePhotoUri(uri: string | null): void {
  if (
    uri !== null &&
    uri.startsWith('blob:') &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(uri);
  }
}

// ---------------------------------------------------------------------------
// 기능 8 — editing a saved experience
// ---------------------------------------------------------------------------

/**
 * The edit form's working copy. Held by the editor screen, never by a store:
 * cancelling is just unmounting it.
 *
 * `body` and `tagsInput` are plain strings because that is what a TextInput
 * gives back; the conversion to the contract's `string | null` and `string[]`
 * happens in `buildExperiencePatch`.
 */
export type ExperienceEditDraft = {
  title: string;
  body: string;
  photoUrl: string | null;
  companion: Companion | null;
  emotions: Emotion[];
  situation: Situation | null;
  tagsInput: string;
};

/** Arrays are copied — toggling a selection must not mutate the store's row. */
export function seedEditDraft(detail: WalkExperienceDetail): ExperienceEditDraft {
  return {
    title: detail.title,
    body: detail.body ?? '',
    photoUrl: detail.photoUrl,
    companion: detail.companion,
    emotions: [...detail.emotions],
    situation: detail.situation,
    tagsInput: formatTagsInput(detail.tags),
  };
}

/** Empty and whitespace-only text mean "cleared", which the contract spells `null`. */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * AGENTS.md: `emotions[]` and `tags[]` are sets. The backend's row order is not
 * specified, so comparing by array position would report phantom changes.
 */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/**
 * The PATCH body for 기능 8, containing ONLY what actually changed.
 *
 * The return type is the immutability guard, not a comment: `startedAt`,
 * `endedAt`, `durationSeconds` and `locationSummary` are absent from
 * `UpdateWalkExperienceRequest`, so assigning one here is a compile error. That
 * only holds because the object is assembled key by key — spreading `current`
 * into it would smuggle every snapshot column into the request.
 *
 * Note the inverted rule versus `POST /walk-experiences`: on the create path an
 * empty array is omitted, but on PATCH omission means KEEP, so clearing every
 * emotion has to send `[]` explicitly or the deselection is silently dropped.
 */
export function buildExperiencePatch(
  current: WalkExperienceDetail,
  draft: ExperienceEditDraft,
): UpdateWalkExperienceRequest {
  const patch: UpdateWalkExperienceRequest = {};

  const title = draft.title.trim();
  if (title !== current.title) patch.title = title;

  const body = emptyToNull(draft.body);
  if (body !== current.body) patch.body = body;

  if (draft.photoUrl !== current.photoUrl) patch.photoUrl = draft.photoUrl;
  if (draft.companion !== current.companion) patch.companion = draft.companion;
  if (draft.situation !== current.situation) patch.situation = draft.situation;

  if (!sameSet(draft.emotions, current.emotions)) patch.emotions = [...draft.emotions];

  const tags = parseTagsInput(draft.tagsInput);
  if (!sameSet(tags, current.tags)) patch.tags = tags;

  return patch;
}

/**
 * Nothing changed. The spec does not define an empty PATCH, and a round trip
 * that can only fail is worse than no round trip.
 */
export function isEmptyPatch(patch: UpdateWalkExperienceRequest): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * The archive list row (기능 6) carries six of the seven editable fields;
 * `body` is not one of them. Destructuring it away keeps this honest if the
 * contract ever grows a field.
 */
export function listItemFields(
  patch: UpdateWalkExperienceRequest,
): Partial<WalkExperienceListItem> {
  const { body: _body, ...rest } = patch;
  return rest;
}
