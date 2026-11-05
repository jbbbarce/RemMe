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

export function formatDue(task: Task, now: Date): string {
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

export const REPEAT_LABELS: Record<Repeat, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
