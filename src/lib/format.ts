/**
 * Display formatting for walk instants and durations, shared by the suggestion
 * screen, the diary flow and the experience detail. Platform-free.
 *
 * All strings render in the device locale's ko-KR forms the prototype shows
 * (`오후 3:42`, `2026년 8월 9일`, `43분`).
 */

export function formatTime(epochMs: number | null): string {
  if (epochMs === null) return '—';
  // hour: 'numeric', not '2-digit' — the prototype shows 오후 3:42, not 오후 03:42.
  return new Date(epochMs).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

export function formatKoreanDate(epochMs: number | null): string {
  if (epochMs === null) return '—';
  return new Date(epochMs).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDurationMinutes(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${Math.max(1, Math.round(seconds / 60))}분`;
}

/** Bare minute count for the big-number layout (`43` + a separate `분` label). */
export function durationMinutes(seconds: number | null): string {
  if (seconds === null) return '—';
  return String(Math.max(1, Math.round(seconds / 60)));
}

/**
 * Time-of-day word for an instant, using the prototype's own hour buckets
 * (its HomeGlassBar timeMessage). Feeds the suggestion banner's copy so it
 * cannot contradict the walk's actual time.
 */
export function daypartLabel(epochMs: number): string {
  const hour = new Date(epochMs).getHours();
  if (hour >= 5 && hour < 9) return '아침';
  if (hour >= 9 && hour < 12) return '오전';
  if (hour >= 12 && hour < 14) return '점심';
  if (hour >= 14 && hour < 18) return '오후';
  if (hour >= 18 && hour < 21) return '저녁';
  return '밤';
}

/**
 * Notification-style relative timestamp. A tap can arrive long after the
 * walk (the notification stays in Notification Center), so a hardcoded
 * '방금 전' would lie next to the card's real time.
 */
export function relativeLabel(epochMs: number, nowMs: number): string {
  const elapsed = Math.max(0, nowMs - epochMs);
  if (elapsed < 60_000) return '방금 전';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  return formatKoreanDate(epochMs);
}
