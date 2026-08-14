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
