import { dayKey } from "./calendar";
import { VERSES, type Verse } from "./verses";

/** 1 for 1 January, in local time. */
export function dayOfYear(day: Date): number {
  const start = new Date(day.getFullYear(), 0, 1);
  const today = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  // Rounding absorbs the hour lost or gained when daylight saving time changes.
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** The verse for a local calendar day: the same all day, the next one after midnight. */
export function verseFor(day: Date, verses: readonly Verse[] = VERSES): Verse {
  return verses[(dayOfYear(day) - 1) % verses.length];
}

/** What clicking a verse copies. */
export function verseClipboardText(verse: Verse): string {
  return `“${verse.text}” — ${verse.ref}`;
}

/** A window's verse is minimized only on the day it was minimized; the next day's verse opens again. */
export function isMinimized(minimizedOn: string | null, now: Date): boolean {
  return minimizedOn === dayKey(now);
}
