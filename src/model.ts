import { doneOnTime, dueOnDay, endOfDay, formatDue, isOverdue, nextDue, startOfDay } from "./dates";
import {
  DENSITIES,
  LIST_COLORS,
  LIST_ICONS,
  REPEATS,
  THEMES,
  type AppData,
  type DeletedItem,
  type ReminderList,
  type Settings,
  type SmartId,
  type Task,
  type View,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  toggleShortcut: "Ctrl+Shift+O",
  lockShortcut: "Ctrl+Shift+L",
  floatView: "today",
  theme: "fluent",
  pomodoroShortcut: "Ctrl+Shift+P",
  pomodoroFocus: 25,
  pomodoroShort: 5,
  pomodoroLong: 15,
  pomodoroChime: true,
  verseOfDay: true,
  stickyReminders: true,
  density: "comfortable",
  floatOpacity: 100,
};

/** Session lengths are whole minutes from 1 to 180. */
export function validMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 180 ? value : fallback;
}

export const SMART_LISTS: { id: SmartId; name: string; color: string }[] = [
  { id: "today", name: "Today", color: "blue" },
  { id: "scheduled", name: "Upcoming", color: "red" },
  { id: "all", name: "All", color: "graphite" },
  { id: "flagged", name: "Flagged", color: "orange" },
  { id: "completed", name: "Done", color: "gray" },
  { id: "calendar", name: "Calendar", color: "blue" },
];

export function newId(): string {
  return crypto.randomUUID();
}

/** Fills in anything missing from older or hand-edited files. */
/** What a saved file may hold: any part of the data, including settings from before a setting existed. */
export type SavedData = Partial<Omit<AppData, "settings">> & { settings?: Partial<Settings> };

export function normalize(raw: SavedData | null | undefined): AppData {
  const lists = (raw?.lists ?? []).map(listFrom);
  if (lists.length === 0) {
    lists.push({ id: "reminders", name: "Reminders", color: "blue", icon: "list", sections: [] });
  }
  const listIds = new Set(lists.map((l) => l.id));
  const tasks: Task[] = (raw?.tasks ?? []).map((t) => {
    const task = taskFrom(t);
    return listIds.has(task.listId) ? task : { ...task, listId: lists[0].id };
  });
  const settings = { ...DEFAULT_SETTINGS, ...raw?.settings };
  if (!THEMES.includes(settings.theme)) settings.theme = DEFAULT_SETTINGS.theme;
  settings.pomodoroFocus = validMinutes(settings.pomodoroFocus, DEFAULT_SETTINGS.pomodoroFocus);
  settings.pomodoroShort = validMinutes(settings.pomodoroShort, DEFAULT_SETTINGS.pomodoroShort);
  settings.pomodoroLong = validMinutes(settings.pomodoroLong, DEFAULT_SETTINGS.pomodoroLong);
  settings.pomodoroChime = settings.pomodoroChime !== false;
  settings.verseOfDay = settings.verseOfDay !== false;
  settings.stickyReminders = settings.stickyReminders !== false;
  if (!DENSITIES.includes(settings.density)) settings.density = DEFAULT_SETTINGS.density;
  settings.floatOpacity =
    typeof settings.floatOpacity === "number" && settings.floatOpacity >= 40 && settings.floatOpacity <= 100
      ? Math.round(settings.floatOpacity)
      : DEFAULT_SETTINGS.floatOpacity;
  const deleted = (Array.isArray(raw?.deleted) ? raw.deleted : []).flatMap(deletedFrom);
  return { version: 1, lists, tasks, settings, deleted };
}

function listFrom(l: Partial<ReminderList>): ReminderList {
  return {
    id: l.id ?? newId(),
    name: l.name ?? "Untitled",
    color: LIST_COLORS.includes(l.color!) ? l.color! : "blue",
    icon: LIST_ICONS.includes(l.icon!) ? l.icon! : "list",
    sections: Array.isArray(l.sections) ? l.sections : [],
  };
}

/** A saved reminder with defaults filled in. Its list isn't checked here. */
function taskFrom(t: Partial<Task>): Task {
  const validDue = !!t.dueAt && !Number.isNaN(Date.parse(t.dueAt));
  return {
    id: t.id ?? newId(),
    listId: t.listId ?? "",
    title: t.title ?? "",
    notes: t.notes ?? "",
    // An unreadable date would break due checks and repeats, so it is dropped.
    dueAt: validDue ? t.dueAt! : null,
    dueHasTime: t.dueHasTime ?? false,
    flagged: t.flagged ?? false,
    priority: t.priority ?? 0,
    completed: t.completed ?? false,
    completedAt: t.completedAt ?? null,
    createdAt: t.createdAt ?? new Date().toISOString(),
    section: t.section ?? null,
    repeat: REPEATS.includes(t.repeat!) && validDue ? t.repeat! : null,
    subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).map((s) => ({
      id: s.id ?? newId(),
      title: s.title ?? "",
      done: s.done ?? false,
    })),
    nagMinutes: typeof t.nagMinutes === "number" && t.nagMinutes > 0 ? t.nagMinutes : null,
    streak: typeof t.streak === "number" && t.streak > 0 ? Math.floor(t.streak) : 0,
    appTrigger: typeof t.appTrigger === "string" && t.appTrigger.trim() ? t.appTrigger.trim() : null,
    nextId: typeof t.nextId === "string" ? t.nextId : null,
    pomodoros: typeof t.pomodoros === "number" && t.pomodoros > 0 ? Math.floor(t.pomodoros) : 0,
    snoozedUntil:
      typeof t.snoozedUntil === "string" && !Number.isNaN(Date.parse(t.snoozedUntil)) && !t.completed
        ? t.snoozedUntil
        : null,
  };
}

/** A saved Recently deleted entry, or nothing if it is unreadable or empty. */
function deletedFrom(e: Partial<DeletedItem> | null): DeletedItem[] {
  if (!e || typeof e !== "object" || typeof e.deletedAt !== "string" || Number.isNaN(Date.parse(e.deletedAt))) {
    return [];
  }
  const tasks = (Array.isArray(e.tasks) ? e.tasks : []).map(taskFrom);
  const list = e.list && typeof e.list === "object" ? listFrom(e.list) : null;
  if (!list && tasks.length === 0) return [];
  const indexes = Array.isArray(e.taskIndexes) ? e.taskIndexes : [];
  const index = (n: unknown) => (typeof n === "number" && n >= 0 ? Math.floor(n) : Number.MAX_SAFE_INTEGER);
  return [
    {
      id: typeof e.id === "string" ? e.id : newId(),
      batch: typeof e.batch === "string" ? e.batch : newId(),
      deletedAt: e.deletedAt,
      list,
      listIndex: index(e.listIndex),
      tasks,
      taskIndexes: tasks.map((_, i) => index(indexes[i])),
    },
  ];
}

export function matchesSmart(id: SmartId, task: Task, now: Date): boolean {
  switch (id) {
    case "today":
      return !task.completed && !!task.dueAt && new Date(task.dueAt) <= endOfDay(now);
    case "scheduled":
      return !task.completed && !!task.dueAt;
    case "all":
      return !task.completed;
    case "flagged":
      return !task.completed && task.flagged;
    case "completed":
      return task.completed;
    case "calendar":
      return !task.completed && !!task.dueAt;
  }
}

export function smartCount(data: AppData, id: SmartId, now: Date): number {
  return data.tasks.filter((t) => matchesSmart(id, t, now)).length;
}

/**
 * Tasks for a view. `showCompleted` only matters for user lists and search.
 * Tasks in `lingering` were just checked off and stay in place briefly, as if unfinished.
 */
export function tasksFor(
  data: AppData,
  view: View,
  now: Date,
  showCompleted: boolean,
  lingering?: ReadonlySet<string>,
): Task[] {
  const asShown = (t: Task) => (t.completed && lingering?.has(t.id) ? { ...t, completed: false } : t);
  let include: (t: Task) => boolean;
  if (view.kind === "smart") {
    include = (t) => matchesSmart(view.id, t, now);
  } else if (view.kind === "list") {
    include = (t) => t.listId === view.id && (showCompleted || !t.completed);
  } else if (view.kind === "deleted") {
    return [];
  } else {
    const q = view.query.trim().toLowerCase();
    include = (t) =>
      (showCompleted || !t.completed) &&
      (t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q));
  }
  const shown = data.tasks.filter((t) => include(asShown(t)));
  return sortTasks(shown, view, (t) => asShown(t).completed);
}

function sortTasks(tasks: Task[], view: View, isDone: (t: Task) => boolean): Task[] {
  const byDue = (a: Task, b: Task) =>
    (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);
  if (view.kind === "smart" && view.id === "completed") {
    return [...tasks].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }
  if (view.kind === "smart" && (view.id === "today" || view.id === "scheduled")) {
    return [...tasks].sort(byDue);
  }
  // User lists keep the order tasks were added; completed ones sink to the bottom.
  return [...tasks].sort((a, b) => Number(isDone(a)) - Number(isDone(b)));
}

/** Where a task created from this view goes, and what it starts with. */
export function newTaskFor(data: AppData, view: View, now: Date, section: string | null = null): Task {
  const listId = view.kind === "list" ? view.id : data.lists[0].id;
  const today9 = new Date(startOfDay(now).getTime() + 9 * 60 * 60 * 1000).toISOString();
  return {
    id: newId(),
    listId,
    title: "",
    notes: "",
    dueAt: view.kind === "smart" && (view.id === "today" || view.id === "scheduled") ? today9 : null,
    dueHasTime: false,
    flagged: view.kind === "smart" && view.id === "flagged",
    priority: 0,
    completed: false,
    completedAt: null,
    createdAt: now.toISOString(),
    section,
    repeat: null,
    subtasks: [],
    nagMinutes: null,
    streak: 0,
    appTrigger: null,
    nextId: null,
    pomodoros: 0,
    snoozedUntil: null,
  };
}

/**
 * Applies a change to one task. A new due date or time, or checking the task off,
 * cancels its snooze: the popup then follows the new due time instead.
 */
export function updateTask(data: AppData, id: string, patch: Partial<Task>): AppData {
  return {
    ...data,
    tasks: data.tasks.map((t) => {
      if (t.id !== id) return t;
      const rescheduled =
        ("dueAt" in patch && patch.dueAt !== t.dueAt) || ("dueHasTime" in patch && patch.dueHasTime !== t.dueHasTime);
      const cancelsSnooze = rescheduled || patch.completed === true;
      return { ...t, ...patch, ...(cancelsSnooze && !("snoozedUntil" in patch) && { snoozedUntil: null }) };
    }),
  };
}

/** When a snoozed reminder's popup comes back, or null if it isn't snoozed now. */
export function activeSnooze(task: Task, now: Date): Date | null {
  if (!task.snoozedUntil || task.completed) return null;
  const until = new Date(task.snoozedUntil);
  return until > now ? until : null;
}

/** "Snoozed until 3:40 PM", with the day too when it isn't today. */
export function snoozeLabel(until: Date, now: Date): string {
  const time = until.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = until.toDateString() === now.toDateString();
  const day = until.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `Snoozed until ${sameDay ? time : `${day}, ${time}`}`;
}

/** How long after checking off a repeating reminder unchecking it takes back the next one. */
export const REPEAT_UNDO_MS = 60_000;

/**
 * Checks a reminder off or back on. Checking off a repeating reminder keeps it as done and adds
 * the next one after it (with id `nextId`, if given). Unchecking it within `REPEAT_UNDO_MS` takes
 * the next one back; later, the next one is left alone and keeps the repeat.
 */
export function setCompleted(data: AppData, id: string, completed: boolean, now: Date, nextId?: string): AppData {
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return data;
  if (!completed) {
    const recent = !!task.completedAt && now.getTime() - Date.parse(task.completedAt) <= REPEAT_UNDO_MS;
    const next = recent ? data.tasks.find((t) => t.id === task.nextId && !t.completed) : undefined;
    const restored = next ? deleteTask(data, next.id) : data;
    return updateTask(restored, id, { completed, completedAt: null, nextId: null, ...(next && { repeat: next.repeat }) });
  }
  const done = updateTask(data, id, { completed, completedAt: now.toISOString() });
  if (!task.repeat || !task.dueAt || task.completed) return done;
  const streak = doneOnTime(task, now) ? task.streak + 1 : 0;
  const next: Task = {
    ...task,
    id: nextId ?? newId(),
    nextId: null,
    pomodoros: 0,
    snoozedUntil: null,
    streak,
    dueAt: nextDue(task, task.repeat, now),
    completed: false,
    completedAt: null,
    createdAt: now.toISOString(),
    subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
  };
  return insertTask(updateTask(done, id, { repeat: null, nextId: next.id }), next, id);
}

export function insertTask(data: AppData, task: Task, afterId?: string): AppData {
  const tasks = [...data.tasks];
  const index = afterId ? tasks.findIndex((t) => t.id === afterId) : -1;
  tasks.splice(index < 0 ? tasks.length : index + 1, 0, task);
  return { ...data, tasks };
}

/** Removes a reminder for good, without going through Recently deleted. */
export function deleteTask(data: AppData, id: string): AppData {
  return { ...data, tasks: data.tasks.filter((t) => t.id !== id) };
}

/** How long Recently deleted keeps things. */
export const KEEP_DELETED_DAYS = 30;

/** A reminder nobody filled in: losing it loses nothing. */
export function isBlank(task: Task): boolean {
  return !task.title.trim() && !task.notes.trim() && !task.dueAt && task.subtasks.length === 0;
}

/**
 * Moves reminders to Recently deleted, each as its own entry in `batch`. Blank ones are dropped.
 * `patch` changes a reminder as it is kept, such as putting back the title that was cleared to delete it.
 */
export function trashTasks(
  data: AppData,
  ids: readonly string[],
  now: Date,
  batch: string,
  patch: Partial<Task> = {},
): AppData {
  const remove = new Set(ids);
  const entries: DeletedItem[] = [];
  data.tasks.forEach((t, index) => {
    if (!remove.has(t.id)) return;
    const kept = { ...t, ...patch };
    if (isBlank(kept)) return;
    entries.push({
      id: newId(),
      batch,
      deletedAt: now.toISOString(),
      list: null,
      listIndex: 0,
      tasks: [kept],
      taskIndexes: [index],
    });
  });
  return {
    ...data,
    tasks: data.tasks.filter((t) => !remove.has(t.id)),
    deleted: [...entries.reverse(), ...data.deleted],
  };
}

/** Moves the finished reminders shown in a view to Recently deleted. */
export function clearCompleted(data: AppData, view: View, now: Date, batch: string = newId()): AppData {
  const ids = tasksFor(data, view, now, true).filter((t) => t.completed).map((t) => t.id);
  return trashTasks(data, ids, now, batch);
}

/** Moves a list and its reminders to Recently deleted. The last list cannot be deleted. */
export function deleteList(data: AppData, id: string, now: Date = new Date(), batch: string = newId()): AppData {
  const listIndex = data.lists.findIndex((l) => l.id === id);
  if (data.lists.length <= 1 || listIndex < 0) return data;
  const taskIndexes: number[] = [];
  const tasks = data.tasks.filter((t, i) => t.listId === id && taskIndexes.push(i) > 0);
  const entry: DeletedItem = {
    id: newId(),
    batch,
    deletedAt: now.toISOString(),
    list: data.lists[listIndex],
    listIndex,
    tasks,
    taskIndexes,
  };
  return {
    ...data,
    lists: data.lists.filter((l) => l.id !== id),
    tasks: data.tasks.filter((t) => t.listId !== id),
    settings: data.settings.floatView === id ? { ...data.settings, floatView: "today" } : data.settings,
    deleted: [entry, ...data.deleted],
  };
}

/** What the Undo toast says about a batch, or null if nothing in it was kept. */
export function deletedMessage(data: AppData, batch: string, cleared = false): string | null {
  const entries = data.deleted.filter((e) => e.batch === batch);
  if (entries.length === 0) return null;
  const listEntry = entries.find((e) => e.list);
  if (listEntry) {
    const name = listEntry.list!.name;
    const n = listEntry.tasks.length;
    return n === 0 ? `Deleted list “${name}”` : `Deleted list “${name}” and ${plural(n, "reminder")}`;
  }
  if (cleared) return `Cleared ${plural(entries.length, "completed reminder")}`;
  if (entries.length === 1) return `Deleted “${entries[0].tasks[0].title.trim() || "New Reminder"}”`;
  return `Deleted ${plural(entries.length, "reminder")}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Puts deleted reminders back, moving any whose list is gone to the first list. */
function placeTasks(tasks: Task[], back: { task: Task; index: number }[], lists: ReminderList[]): Task[] {
  const listIds = new Set(lists.map((l) => l.id));
  const present = new Set(tasks.map((t) => t.id));
  const out = [...tasks];
  for (const { task, index } of back) {
    if (present.has(task.id)) continue;
    const placed = listIds.has(task.listId) ? task : { ...task, listId: lists[0].id, section: null };
    out.splice(Math.min(index, out.length), 0, placed);
  }
  return out;
}

/** Undo: puts everything deleted in `batch` back exactly where it was. */
export function undoDelete(data: AppData, batch: string): AppData {
  const entries = data.deleted.filter((e) => e.batch === batch);
  if (entries.length === 0) return data;
  const lists = [...data.lists];
  for (const e of entries.filter((x) => x.list).sort((a, b) => a.listIndex - b.listIndex)) {
    if (lists.some((l) => l.id === e.list!.id)) continue;
    lists.splice(Math.min(e.listIndex, lists.length), 0, e.list!);
  }
  // Inserting in order of the old positions rebuilds the old order.
  const back = entries
    .flatMap((e) => e.tasks.map((task, i) => ({ task, index: e.taskIndexes[i] ?? Number.MAX_SAFE_INTEGER })))
    .sort((a, b) => a.index - b.index);
  return { ...data, lists, tasks: placeTasks(data.tasks, back, lists), deleted: data.deleted.filter((e) => e.batch !== batch) };
}

/** Restore from Recently deleted: back in its list (or the first list if that is gone), at the end. */
export function restoreDeleted(data: AppData, entryId: string): AppData {
  const entry = data.deleted.find((e) => e.id === entryId);
  if (!entry) return data;
  const list = entry.list;
  const lists = list && !data.lists.some((l) => l.id === list.id) ? [...data.lists, list] : data.lists;
  const back = entry.tasks.map((task) => ({ task, index: Number.MAX_SAFE_INTEGER }));
  return { ...data, lists, tasks: placeTasks(data.tasks, back, lists), deleted: data.deleted.filter((e) => e.id !== entryId) };
}

/** Deletes one entry of Recently deleted for good. */
export function forgetDeleted(data: AppData, entryId: string): AppData {
  return { ...data, deleted: data.deleted.filter((e) => e.id !== entryId) };
}

/** Empty Recently Deleted. */
export function emptyDeleted(data: AppData): AppData {
  return data.deleted.length === 0 ? data : { ...data, deleted: [] };
}

/** Drops entries older than `KEEP_DELETED_DAYS`. Returns the same object when nothing expired. */
export function purgeDeleted(data: AppData, now: Date): AppData {
  const cutoff = now.getTime() - KEEP_DELETED_DAYS * 24 * 60 * 60 * 1000;
  const kept = data.deleted.filter((e) => Date.parse(e.deletedAt) > cutoff);
  return kept.length === data.deleted.length ? data : { ...data, deleted: kept };
}

/**
 * Moves a reminder next to another one, before it or (with `after`) after it, as a drag does.
 * It joins that reminder's list and section.
 */
export function moveTask(data: AppData, id: string, targetId: string, after: boolean): AppData {
  const task = data.tasks.find((t) => t.id === id);
  const target = data.tasks.find((t) => t.id === targetId);
  if (!task || !target || id === targetId) return data;
  const rest = data.tasks.filter((t) => t.id !== id);
  const index = rest.findIndex((t) => t.id === targetId) + (after ? 1 : 0);
  rest.splice(index, 0, { ...task, listId: target.listId, section: target.section });
  return { ...data, tasks: rest };
}

/** Copies of some reminders and where they were, so a change to them can be undone. */
export type Snapshot = { task: Task; index: number }[];

export function snapshot(data: AppData, ids: readonly string[]): Snapshot {
  return data.tasks.flatMap((task, index) => (ids.includes(task.id) ? [{ task, index }] : []));
}

/** Undo: puts the reminders in a snapshot back as they were, in the same places. Others are left alone. */
export function restoreSnapshot(data: AppData, snap: Snapshot): AppData {
  const ids = new Set(snap.map((s) => s.task.id));
  const tasks = data.tasks.filter((t) => !ids.has(t.id));
  for (const { task, index } of [...snap].sort((a, b) => a.index - b.index)) {
    tasks.splice(Math.min(index, tasks.length), 0, task);
  }
  return { ...data, tasks };
}

function quoted(task: Task): string {
  const title = task.title.trim() || "New Reminder";
  return `“${title.length > 40 ? `${title.slice(0, 39)}…` : title}”`;
}

/**
 * What the Undo toast says after a quick change to a reminder, or null if the change doesn't
 * need one (such as only reordering it).
 */
export function changeMessage(data: AppData, id: string, patch: Partial<Task>, now: Date): string | null {
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return null;
  const name = quoted(task);
  if (patch.listId !== undefined && patch.listId !== task.listId) {
    return `Moved ${name} to ${data.lists.find((l) => l.id === patch.listId)?.name ?? "another list"}`;
  }
  if (patch.section !== undefined && patch.section !== task.section) {
    return `Moved ${name} to ${patch.section ?? "Others"}`;
  }
  if (patch.dueAt !== undefined && (patch.dueAt !== task.dueAt || patch.dueHasTime !== task.dueHasTime)) {
    if (!patch.dueAt) return `Removed the date from ${name}`;
    return `${name} is due ${formatDue({ dueAt: patch.dueAt, dueHasTime: patch.dueHasTime ?? task.dueHasTime }, now)}`;
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    return patch.priority ? `Set ${name} to ${["", "Low", "Medium", "High"][patch.priority]} priority` : `Removed the priority from ${name}`;
  }
  if (patch.flagged !== undefined && patch.flagged !== task.flagged) {
    return `${patch.flagged ? "Flagged" : "Unflagged"} ${name}`;
  }
  return null;
}

/**
 * Changes several reminders at once, as from a multi-selection. A date in `patch` moves each
 * reminder to that day and keeps its own time (or lack of one).
 */
export function updateTasks(data: AppData, ids: readonly string[], patch: Partial<Task>): AppData {
  let next = data;
  for (const id of ids) {
    const task = next.tasks.find((t) => t.id === id);
    if (!task) continue;
    const own = typeof patch.dueAt === "string" ? { ...patch, ...dueOnDay(task, new Date(patch.dueAt)) } : patch;
    next = updateTask(next, id, own);
  }
  return next;
}

/** The Undo toast after a change to several reminders; one reminder gets `changeMessage`. */
export function changeManyMessage(data: AppData, ids: readonly string[], patch: Partial<Task>, now: Date): string | null {
  if (ids.length === 1) return changeMessage(data, ids[0], patch, now);
  const n = plural(ids.length, "reminder");
  if (patch.listId !== undefined) return `Moved ${n} to ${data.lists.find((l) => l.id === patch.listId)?.name ?? "another list"}`;
  if (patch.dueAt !== undefined) {
    return patch.dueAt ? `Moved ${n} to ${formatDue({ dueAt: patch.dueAt, dueHasTime: false }, now)}` : `Removed the date from ${n}`;
  }
  if (patch.priority !== undefined) {
    return patch.priority ? `Set ${n} to ${["", "Low", "Medium", "High"][patch.priority]} priority` : `Removed the priority from ${n}`;
  }
  if (patch.flagged !== undefined) return `${patch.flagged ? "Flagged" : "Unflagged"} ${n}`;
  return `Changed ${n}`;
}

/** The Undo toast after ticking several reminders off at once. */
export function completedManyMessage(count: number): string {
  return `Completed ${plural(count, "reminder")}`;
}

export interface DayGroup {
  key: string;
  title: string;
  overdue: boolean;
  tasks: Task[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The heading a dated reminder sits under in Today and Upcoming: Overdue, Today, Tomorrow, a
 * weekday for the rest of the coming week, then "Later this month" and month names.
 */
export function dayGroupTitle(task: Task, now: Date): string {
  if (!task.dueAt) return "No date";
  // A reminder just ticked off stays where it was for a moment.
  if (isOverdue({ ...task, completed: false }, now)) return "Overdue";
  const due = new Date(task.dueAt);
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return due.toLocaleDateString(undefined, { weekday: "long" });
  if (due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth()) return "Later this month";
  return due.toLocaleDateString(undefined, { month: "long", year: due.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** Groups reminders (already sorted by date) under their day headings, Overdue first. */
export function dayGroups(tasks: Task[], now: Date): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const task of tasks) {
    const title = dayGroupTitle(task, now);
    if (!groups.has(title)) groups.set(title, { key: title, title, overdue: title === "Overdue", tasks: [] });
    groups.get(title)!.tasks.push(task);
  }
  return [...groups.values()].sort((a, b) => Number(b.overdue) - Number(a.overdue));
}

/** The Undo toast after ticking a reminder off. */
export function completedMessage(data: AppData, id: string): string | null {
  const task = data.tasks.find((t) => t.id === id);
  return task ? `Completed ${quoted(task)}` : null;
}

export function upsertList(data: AppData, list: ReminderList): AppData {
  const exists = data.lists.some((l) => l.id === list.id);
  return {
    ...data,
    lists: exists ? data.lists.map((l) => (l.id === list.id ? list : l)) : [...data.lists, list],
  };
}

export function renameSection(data: AppData, listId: string, from: string, to: string): AppData {
  const name = to.trim();
  const list = data.lists.find((l) => l.id === listId);
  if (!list || !name || (name !== from && list.sections.includes(name))) return data;
  return {
    ...data,
    lists: data.lists.map((l) =>
      l.id === listId ? { ...l, sections: l.sections.map((s) => (s === from ? name : s)) } : l,
    ),
    tasks: data.tasks.map((t) => (t.listId === listId && t.section === from ? { ...t, section: name } : t)),
  };
}

/** Removes a section; its tasks move to "Others". */
export function deleteSection(data: AppData, listId: string, name: string): AppData {
  return {
    ...data,
    lists: data.lists.map((l) => (l.id === listId ? { ...l, sections: l.sections.filter((s) => s !== name) } : l)),
    tasks: data.tasks.map((t) => (t.listId === listId && t.section === name ? { ...t, section: null } : t)),
  };
}

export function viewTitle(data: AppData, view: View): string {
  if (view.kind === "deleted") return "Recently deleted";
  if (view.kind === "smart") return SMART_LISTS.find((s) => s.id === view.id)!.name;
  if (view.kind === "list") return data.lists.find((l) => l.id === view.id)?.name ?? "";
  return `Results for “${view.query}”`;
}

export function viewColor(data: AppData, view: View): string {
  if (view.kind === "smart") return SMART_LISTS.find((s) => s.id === view.id)!.color;
  if (view.kind === "list") return data.lists.find((l) => l.id === view.id)?.color ?? "blue";
  return "gray";
}

/** Parses a stored float view id (smart id or list id) into a view that still exists. */
export function floatViewOf(data: AppData): View {
  const id = data.settings.floatView;
  if (SMART_LISTS.some((s) => s.id === id)) return { kind: "smart", id: id as SmartId };
  if (data.lists.some((l) => l.id === id)) return { kind: "list", id };
  return { kind: "smart", id: "today" };
}
