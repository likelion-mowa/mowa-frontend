/**
 * Calendar math in Asia/Seoul, the service's reference timezone
 * (`docs/backend/api-spec.md` 기능 6 — "캘린더 날짜는 Asia/Seoul(KST) 기준으로
 * 처리합니다", data-tables.md §archive).
 *
 * Grouping and filtering must land on the same day the server would pick, so
 * they go through here. Display formatting (src/lib/format.ts) stays on the
 * device locale, which is what the diary flow already ships.
 *
 * The offset is a fixed shift rather than Intl's `timeZone` option: Korea has
 * no DST, and Hermes' Intl timezone support is not something this repo has
 * verified on device.
 */
import type { IsoDate, IsoDateTime } from '@/api/types';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type KstParts = {
  year: number;
  /** 1-12, not the 0-based month of Date. */
  month: number;
  day: number;
};

function partsFromShifted(shifted: Date): KstParts {
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function kstPartsFromEpoch(epochMs: number): KstParts {
  return partsFromShifted(new Date(epochMs + KST_OFFSET_MS));
}

/** `startedAt` arrives as ISO 8601 with an offset, so Date.parse is exact. */
export function kstPartsFromIso(iso: IsoDateTime): KstParts {
  return kstPartsFromEpoch(Date.parse(iso));
}

export function kstNow(nowMs: number): KstParts {
  return kstPartsFromEpoch(nowMs);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYY-MM`, the archive's month-group key. */
export function kstMonthKey(iso: IsoDateTime): string {
  const { year, month } = kstPartsFromIso(iso);
  return `${year}-${pad(month)}`;
}

/** `YYYY-MM-DD`, the calendar's day key. */
export function kstDayKey(iso: IsoDateTime): IsoDate {
  const { year, month, day } = kstPartsFromIso(iso);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 기능 12's year/month/day → `from`/`to` conversion. The backend has no
 * calendar table: the client turns a picked period into a range and the list
 * endpoint filters `startedAt` by it (api-spec.md 기능 12).
 */
export function kstMonthRange(year: number, month: number): { from: IsoDate; to: IsoDate } {
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`,
  };
}

export function kstYearRange(year: number): { from: IsoDate; to: IsoDate } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function kstDayRange(parts: KstParts): { from: IsoDate; to: IsoDate } {
  const day: IsoDate = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  return { from: day, to: day };
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday, matching the calendar grid's first column. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/** Month arithmetic that rolls the year over, for the calendar's month nav. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}
