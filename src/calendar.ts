import { startOfDay, stepDate } from "./dates";
import type { Task } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export type CalendarMode = "month" | "week";

/**
 * The weekday weeks start on, as `Date.getDay()` numbers it (0 is Sunday), from the region
 * settings the app runs with. Falls back to Sunday where the browser can't say.
 */
export function weekStartDay(locale = navigator.language): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?(): { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    return firstDay ? firstDay % 7 : 0;
  } catch {
    return 0;
  }
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/** The first day of the week holding `day`. */
export function startOfWeek(day: Date, weekStart: number): Date {
  const back = (day.getDay() - weekStart + 7) % 7;
  return addDays(startOfDay(day), -back);
}

/** The 7 days of the week holding `anchor`. */
export function weekDays(anchor: Date, weekStart: number): Date[] {
  const first = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** Six full weeks covering `anchor`'s month, so every month fits and the grid never changes height. */
export function monthGrid(anchor: Date, weekStart: number): Date[] {
  const first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** The visible days moved one month or week back (-1) or forward (+1). */
export function shiftAnchor(anchor: Date, mode: CalendarMode, by: number): Date {
  return mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + by, 1) : addDays(anchor, 7 * by);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** `yyyy-mm-dd` in local time, for keying days. */
export function dayKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/** A reminder on one day of the calendar. Faded ones are later dates of a repeating reminder. */
export interface CalendarItem {
  task: Task;
  date: Date;
  faded: boolean;
}

/**
 * Reminders on each day from `from` to `to` (inclusive), keyed by `dayKey`. Each day lists
 * all-day reminders first, then timed ones by time. A repeating reminder that isn't done
 * also shows its later dates in the range, faded.
 */
export function itemsByDay(tasks: Task[], from: Date, to: Date, showDone: boolean): Map<string, CalendarItem[]> {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime() + DAY;
  const days = new Map<string, CalendarItem[]>();
  const put = (task: Task, date: Date, faded: boolean) => {
    if (date.getTime() < start || date.getTime() >= end) return;
    const key = dayKey(date);
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push({ task, date, faded });
  };

  for (const task of tasks) {
    if (!task.dueAt || (task.completed && !showDone)) continue;
    const due = new Date(task.dueAt);
    put(task, due, false);
    if (task.repeat && !task.completed) {
      for (let k = 1; ; k++) {
        const next = stepDate(due, task.repeat, k);
        if (next.getTime() >= end) break;
        put(task, next, true);
      }
    }
  }

  for (const items of days.values()) {
    items.sort((a, b) => {
      if (a.task.dueHasTime !== b.task.dueHasTime) return a.task.dueHasTime ? 1 : -1;
      return a.task.dueHasTime ? a.date.getTime() - b.date.getTime() : 0;
    });
  }
  return days;
}

/** The change that moves a reminder to `day`, keeping its time; an undated one gets that date with no time. */
export function moveToDay(task: Task, day: Date): Pick<Task, "dueAt" | "dueHasTime"> {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const [h, m] = due && task.dueHasTime ? [due.getHours(), due.getMinutes()] : [9, 0];
  return {
    dueAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).toISOString(),
    dueHasTime: !!due && task.dueHasTime,
  };
}

/** Undated reminders for the "No date" column. */
export function undated(tasks: Task[], showDone: boolean): Task[] {
  return tasks.filter((t) => !t.dueAt && (showDone || !t.completed));
}
