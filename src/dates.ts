import type { Repeat, Task } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(startOfDay(date).getTime() + DAY - 1);
}

/** `yyyy-mm-dd` in local time, for `<input type="date">`. */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `HH:mm` in local time, for `<input type="time">`. */
export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combines local date and time inputs into an ISO timestamp. */
export function fromInputs(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

export function isOverdue(task: Task, now: Date): boolean {
  if (!task.dueAt || task.completed) return false;
  const due = new Date(task.dueAt);
  return task.dueHasTime ? due < now : due < startOfDay(now);
}

export function formatDue(task: Pick<Task, "dueAt" | "dueHasTime">, now: Date): string {
  if (!task.dueAt) return "";
  const due = new Date(task.dueAt);
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY);
  let day: string;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Tomorrow";
  else if (days === -1) day = "Yesterday";
  else
    day = due.toLocaleDateString(undefined, {
      weekday: Math.abs(days) < 7 ? "short" : undefined,
      month: "short",
      day: "numeric",
      year: due.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
  if (!task.dueHasTime) return day;
  return `${day}, ${due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * The due date after `task`'s for its repeat, skipping any that have already passed:
 * a reminder done late comes back on its next future day, not on a day already gone.
 * Monthly and yearly repeats keep the original day, using the month's last day when it is shorter.
 */
export function nextDue(task: Task, repeat: Repeat, now: Date): string {
  const base = new Date(task.dueAt!);
  const tomorrow = new Date(startOfDay(now).getTime() + DAY);
  for (let k = 1; ; k++) {
    const next = stepDate(base, repeat, k);
    if (task.dueHasTime ? next > now : next >= tomorrow) return next.toISOString();
  }
}

/** The `k`th date after `base` for a repeat. */
export function stepDate(base: Date, repeat: Repeat, k: number): Date {
  const [y, m, d, h, min] = [base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), base.getMinutes()];
  if (repeat === "daily") return new Date(y, m, d + k, h, min);
  if (repeat === "weekly") return new Date(y, m, d + 7 * k, h, min);
  const [year, month] = repeat === "monthly" ? [y, m + k] : [y + k, m];
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d, lastDay), h, min);
}

/** Done by the end of its due day. */
export function doneOnTime(task: Task, doneAt: Date): boolean {
  return !!task.dueAt && doneAt <= endOfDay(new Date(task.dueAt));
}

/** The streak to show on an unfinished repeating reminder: none once its due day has gone by. */
export function currentStreak(task: Task, now: Date): number {
  if (!task.repeat || !task.dueAt || task.completed || !doneOnTime(task, now)) return 0;
  return task.streak;
}

/** The quick date choices on a reminder's menu and date picker. */
export const DAY_PRESETS = ["today", "tomorrow", "nextWeek"] as const;
export type DayPreset = (typeof DAY_PRESETS)[number];

export const DAY_PRESET_LABELS: Record<DayPreset, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  nextWeek: "Next week",
};

/** The day a preset means. Next week is the coming Monday (a week on, if today is Monday). */
export function presetDay(preset: DayPreset, now: Date): Date {
  const today = startOfDay(now);
  if (preset === "today") return today;
  if (preset === "tomorrow") return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const toMonday = ((8 - today.getDay()) % 7) || 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + toMonday);
}

/** How long Snooze in a reminder's menu waits; `tomorrow` means 9:00 am tomorrow. */
export const SNOOZE_PRESETS = [
  { label: "10 minutes", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 180 },
  { label: "Tomorrow, 9:00 am", minutes: "tomorrow" },
] as const;

/** When a snooze chosen now ends. */
export function snoozeUntil(minutes: number | "tomorrow", now: Date): Date {
  if (minutes === "tomorrow") return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return new Date(now.getTime() + minutes * 60_000);
}

/** Snooze is offered on unfinished reminders due by the end of today: the ones whose popup is or will soon be up. */
export function canSnooze(task: Pick<Task, "dueAt" | "completed">, now: Date): boolean {
  return !task.completed && !!task.dueAt && new Date(task.dueAt) <= endOfDay(now);
}

/** "Mon 23 Nov": the short date shown beside a preset. */
export function shortDay(day: Date): string {
  return day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

type Due = Pick<Task, "dueAt" | "dueHasTime">;

/** Moves a reminder to `day`. A reminder with a time keeps it; one without gets the usual 9:00 date-only due. */
export function dueOnDay(task: Due, day: Date): Due {
  const [h, m] = task.dueAt && task.dueHasTime ? toTimeInput(task.dueAt).split(":") : ["09", "00"];
  return { dueAt: fromInputs(toDateInput(day.toISOString()), `${h}:${m}`), dueHasTime: task.dueHasTime && !!task.dueAt };
}

/**
 * Sets a reminder's time (`HH:mm`), on its own day or today if it has none. `null` takes the time off
 * and keeps the day.
 */
export function dueAtTime(task: Due, time: string | null, now: Date): Due {
  const day = task.dueAt ? toDateInput(task.dueAt) : toDateInput(now.toISOString());
  return time ? { dueAt: fromInputs(day, time), dueHasTime: true } : { dueAt: fromInputs(day, "09:00"), dueHasTime: false };
}

/** Taking the date off also ends a repeat and nagging, which both need a date. */
export const NO_DUE: Pick<Task, "dueAt" | "dueHasTime" | "repeat" | "nagMinutes"> = {
  dueAt: null,
  dueHasTime: false,
  repeat: null,
  nagMinutes: null,
};

/** The quick time choices in the date picker, as `HH:mm`. */
export const TIME_PRESETS = ["09:00", "12:00", "18:00"] as const;

/** "9:00 am" in the reader's own clock style. */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
