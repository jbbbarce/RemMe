import type { Task } from "./types";

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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
