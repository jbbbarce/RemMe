import { endOfDay, startOfDay } from "./dates";
import {
  LIST_COLORS,
  LIST_ICONS,
  type AppData,
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
};

export const SMART_LISTS: { id: SmartId; name: string; color: string }[] = [
  { id: "today", name: "Today", color: "blue" },
  { id: "scheduled", name: "Scheduled", color: "red" },
  { id: "all", name: "All", color: "graphite" },
  { id: "flagged", name: "Flagged", color: "orange" },
  { id: "completed", name: "Completed", color: "gray" },
];

export function newId(): string {
  return crypto.randomUUID();
}

/** Fills in anything missing from older or hand-edited files. */
export function normalize(raw: Partial<AppData> | null | undefined): AppData {
  const lists: ReminderList[] = (raw?.lists ?? []).map((l) => ({
    id: l.id ?? newId(),
    name: l.name ?? "Untitled",
    color: LIST_COLORS.includes(l.color) ? l.color : "blue",
    icon: LIST_ICONS.includes(l.icon) ? l.icon : "list",
    sections: Array.isArray(l.sections) ? l.sections : [],
  }));
  if (lists.length === 0) {
    lists.push({ id: "reminders", name: "Reminders", color: "blue", icon: "list", sections: [] });
  }
  const listIds = new Set(lists.map((l) => l.id));
  const tasks: Task[] = (raw?.tasks ?? []).map((t) => ({
    id: t.id ?? newId(),
    listId: listIds.has(t.listId) ? t.listId : lists[0].id,
    title: t.title ?? "",
    notes: t.notes ?? "",
    dueAt: t.dueAt ?? null,
    dueHasTime: t.dueHasTime ?? false,
    flagged: t.flagged ?? false,
    priority: t.priority ?? 0,
    completed: t.completed ?? false,
    completedAt: t.completedAt ?? null,
    createdAt: t.createdAt ?? new Date().toISOString(),
    section: t.section ?? null,
  }));
  return { version: 1, lists, tasks, settings: { ...DEFAULT_SETTINGS, ...raw?.settings } };
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
  };
}

export function updateTask(data: AppData, id: string, patch: Partial<Task>): AppData {
  return { ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function setCompleted(data: AppData, id: string, completed: boolean, now: Date): AppData {
  return updateTask(data, id, { completed, completedAt: completed ? now.toISOString() : null });
}

export function insertTask(data: AppData, task: Task, afterId?: string): AppData {
  const tasks = [...data.tasks];
  const index = afterId ? tasks.findIndex((t) => t.id === afterId) : -1;
  tasks.splice(index < 0 ? tasks.length : index + 1, 0, task);
  return { ...data, tasks };
}

export function deleteTask(data: AppData, id: string): AppData {
  return { ...data, tasks: data.tasks.filter((t) => t.id !== id) };
}

export function clearCompleted(data: AppData, view: View, now: Date): AppData {
  const remove = new Set(tasksFor(data, view, now, true).filter((t) => t.completed).map((t) => t.id));
  return { ...data, tasks: data.tasks.filter((t) => !remove.has(t.id)) };
}

export function upsertList(data: AppData, list: ReminderList): AppData {
  const exists = data.lists.some((l) => l.id === list.id);
  return {
    ...data,
    lists: exists ? data.lists.map((l) => (l.id === list.id ? list : l)) : [...data.lists, list],
  };
}

/** Deletes a list and its tasks. The last list cannot be deleted. */
export function deleteList(data: AppData, id: string): AppData {
  if (data.lists.length <= 1) return data;
  return {
    ...data,
    lists: data.lists.filter((l) => l.id !== id),
    tasks: data.tasks.filter((t) => t.listId !== id),
    settings: data.settings.floatView === id ? { ...data.settings, floatView: "today" } : data.settings,
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
