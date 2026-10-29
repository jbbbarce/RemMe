import { describe, expect, it } from "vitest";
import { formatDue, isOverdue } from "./dates";
import { deleteList, deleteSection, floatViewOf, normalize, renameSection, setCompleted, smartCount, tasksFor } from "./model";
import { shortcutFromEvent } from "./shortcut";
import type { Task } from "./types";

const now = new Date(2026, 9, 27, 12, 0);

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? Math.random().toString(),
    listId: "reminders",
    title: "t",
    notes: "",
    dueAt: null,
    dueHasTime: false,
    flagged: false,
    priority: 0,
    completed: false,
    completedAt: null,
    createdAt: now.toISOString(),
    section: null,
    repeat: null,
    ...over,
  };
}

const at = (h: number, dayOffset = 0) => new Date(2026, 9, 27 + dayOffset, h, 0).toISOString();

describe("smart lists", () => {
  const data = normalize({
    tasks: [
      task({ id: "overdue", dueAt: at(9, -2), dueHasTime: true }),
      task({ id: "tonight", dueAt: at(20), dueHasTime: true }),
      task({ id: "tomorrow", dueAt: at(9, 1) }),
      task({ id: "flag", flagged: true }),
      task({ id: "done", completed: true, flagged: true, dueAt: at(8) }),
    ],
  });

  it("counts each smart list", () => {
    expect(smartCount(data, "today", now)).toBe(2);
    expect(smartCount(data, "scheduled", now)).toBe(3);
    expect(smartCount(data, "all", now)).toBe(4);
    expect(smartCount(data, "flagged", now)).toBe(1);
    expect(smartCount(data, "completed", now)).toBe(1);
  });

  it("orders scheduled reminders by due time", () => {
    const ids = tasksFor(data, { kind: "smart", id: "scheduled" }, now, false).map((t) => t.id);
    expect(ids).toEqual(["overdue", "tonight", "tomorrow"]);
  });

  it("keeps a just-completed reminder visible while it lingers", () => {
    const view = { kind: "smart", id: "today" } as const;
    const done = { ...data, tasks: data.tasks.map((t) => (t.id === "tonight" ? { ...t, completed: true } : t)) };
    expect(tasksFor(done, view, now, false).map((t) => t.id)).toEqual(["overdue"]);
    expect(tasksFor(done, view, now, false, new Set(["tonight"])).map((t) => t.id)).toEqual(["overdue", "tonight"]);
  });

  it("searches titles and notes", () => {
    const d = normalize({ tasks: [task({ id: "a", title: "Pay bills" }), task({ id: "b", notes: "bill #42" })] });
    expect(tasksFor(d, { kind: "search", query: "BILL" }, now, false)).toHaveLength(2);
  });
});

describe("dates", () => {
  it("marks date-only reminders overdue only after their day", () => {
    expect(isOverdue(task({ dueAt: at(9) }), now)).toBe(false);
    expect(isOverdue(task({ dueAt: at(9), dueHasTime: true }), now)).toBe(true);
    expect(isOverdue(task({ dueAt: at(9, -1) }), now)).toBe(true);
  });

  it("uses relative day names", () => {
    expect(formatDue(task({ dueAt: at(9) }), now)).toBe("Today");
    expect(formatDue(task({ dueAt: at(9, 1) }), now)).toBe("Tomorrow");
    expect(formatDue(task({ dueAt: at(9, -1) }), now)).toBe("Yesterday");
  });
});

describe("lists and sections", () => {
  const base = normalize({
    lists: [
      { id: "a", name: "A", color: "red", icon: "star", sections: ["Danny", "Ashley"] },
      { id: "b", name: "B", color: "blue", icon: "list", sections: [] },
    ],
    tasks: [task({ id: "1", listId: "a", section: "Danny" }), task({ id: "2", listId: "b" })],
    settings: { toggleShortcut: "Ctrl+Shift+O", lockShortcut: "Ctrl+Shift+L", floatView: "a" },
  });

  it("renames a section and moves its tasks", () => {
    const d = renameSection(base, "a", "Danny", "Dan");
    expect(d.lists[0].sections).toEqual(["Dan", "Ashley"]);
    expect(d.tasks[0].section).toBe("Dan");
    expect(renameSection(base, "a", "Danny", "Ashley")).toBe(base);
  });

  it("moves tasks to Others when a section is deleted", () => {
    expect(deleteSection(base, "a", "Danny").tasks[0].section).toBeNull();
  });

  it("deletes a list with its tasks and resets the floating view", () => {
    const d = deleteList(base, "a");
    expect(d.lists.map((l) => l.id)).toEqual(["b"]);
    expect(d.tasks.map((t) => t.id)).toEqual(["2"]);
    expect(floatViewOf(d)).toEqual({ kind: "smart", id: "today" });
    expect(deleteList(d, "b")).toBe(d);
  });

  it("fills defaults for missing data", () => {
    const d = normalize(null);
    expect(d.lists).toHaveLength(1);
    expect(d.settings.toggleShortcut).toBe("Ctrl+Shift+O");
  });
});

describe("shortcut recorder", () => {
  const key = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
    key: code.replace(/^Key/, "").toLowerCase(),
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });

  it("builds shortcuts from key presses", () => {
    expect(shortcutFromEvent(key("KeyO", { ctrlKey: true, shiftKey: true }))).toEqual({ shortcut: "Ctrl+Shift+O" });
    expect(shortcutFromEvent(key("F9"))).toEqual({ shortcut: "F9" });
  });

  it("waits while only modifiers are held", () => {
    expect(shortcutFromEvent({ ...key("ShiftLeft", { shiftKey: true }), key: "Shift" })).toBeNull();
  });

  it("rejects shortcuts that would capture typing", () => {
    expect(shortcutFromEvent(key("KeyL", { shiftKey: true }))).toHaveProperty("error");
  });
});

describe("repeating reminders", () => {
  const later = new Date(2026, 9, 27, 18, 0);
  const of = (over: Partial<Task>) => normalize({ tasks: [task({ id: "r", ...over })] });

  it("adds the next one when checked off, and takes it back when unchecked", () => {
    const data = of({ repeat: "daily", dueAt: at(9), dueHasTime: true });
    const done = setCompleted(data, "r", true, later, "next");
    expect(done.tasks.map((t) => [t.id, t.completed, t.repeat, t.dueAt])).toEqual([
      ["r", true, null, at(9)],
      ["next", false, "daily", at(9, 1)],
    ]);
    const undone = setCompleted(done, "r", false, later, "next");
    expect(undone.tasks.map((t) => [t.id, t.completed, t.repeat])).toEqual([["r", false, "daily"]]);
  });

  it("skips repeats that already passed", () => {
    const data = of({ repeat: "weekly", dueAt: at(9, -15) });
    const next = setCompleted(data, "r", true, now, "n").tasks.find((t) => t.id === "n")!;
    expect(next.dueAt).toBe(at(9, 6));
  });

  it("keeps the day of the month, using the last day of shorter months", () => {
    const jan31 = new Date(2026, 0, 31, 9).toISOString();
    const data = { ...of({ repeat: "monthly", dueAt: jan31 }) };
    const next = setCompleted(data, "r", true, new Date(2026, 0, 31, 12), "n").tasks.find((t) => t.id === "n")!;
    expect(next.dueAt).toBe(new Date(2026, 1, 28, 9).toISOString());
  });

  it("drops a repeat with no date when loading", () => {
    expect(of({ repeat: "daily" }).tasks[0].repeat).toBeNull();
  });
});
