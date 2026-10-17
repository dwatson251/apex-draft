import { hashString, Rng } from "./rng.ts";
import { randomPhrase } from "./seed.ts";

/**
 * The Daily: one track a day, the same for everyone. The day is a UTC date, so every player (and the server) agrees on which one it is,
 * and the track is a pure function of it. The times set on it are ordinary Time Trial times on that phrase.
 */

/** `2026-10-17`: the UTC day. */
export const dailyDate = (d: Date): string => d.toISOString().slice(0, 10);

export const isDateKey = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) && dailyDate(new Date(`${x}T00:00:00Z`)) === x;

/** The day's track phrase. */
export const dailyPhrase = (dateKey: string): string => randomPhrase(new Rng(hashString(`daily:${dateKey}`)));

/** The date `n` days after (or before, if negative) `dateKey`. */
export const addDays = (dateKey: string, n: number): string => dailyDate(new Date(Date.parse(`${dateKey}T00:00:00Z`) + n * 86400000));

/** Whether `dateKey` is within `days` of `today`: the server only takes a daily from a day near its own. */
export const withinDays = (dateKey: string, today: string, days = 1): boolean => isDateKey(dateKey) && Math.abs(Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) <= days * 86400000;

export interface DailyRecord {
  /** your best time on each day you ran, newest kept: at most `DAILY_KEEP` */
  days: Record<string, number>;
}
export const DAILY_KEEP = 30;

export const newDaily = (): DailyRecord => ({ days: {} });

/** `rec` with a time on a day; only a faster time replaces one already there. */
export function recordDaily(rec: DailyRecord, dateKey: string, time: number): DailyRecord {
  if (!isDateKey(dateKey) || !Number.isFinite(time) || time <= 0) return rec;
  const prev = rec.days[dateKey];
  if (prev !== undefined && prev <= time) return rec;
  const days = { ...rec.days, [dateKey]: time };
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - DAILY_KEEP))) delete days[k];
  return { days };
}

/** How many days in a row, ending today (or yesterday, if today is not run yet), have a time. */
export function dailyStreak(rec: DailyRecord, today: string): number {
  let day = rec.days[today] !== undefined ? today : addDays(today, -1), n = 0;
  while (rec.days[day] !== undefined) { n++; day = addDays(day, -1); }
  return n;
}

export function normaliseDaily(x: unknown): DailyRecord {
  const out: DailyRecord = newDaily();
  const days = x && typeof x === "object" ? (x as { days?: unknown }).days : null;
  if (days && typeof days === "object") for (const [k, v] of Object.entries(days as Record<string, unknown>)) if (isDateKey(k) && typeof v === "number" && Number.isFinite(v) && v > 0) out.days[k] = v;
  return out;
}
