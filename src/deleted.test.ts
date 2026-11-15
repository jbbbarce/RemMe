import { describe, expect, it } from "vitest";
import {
  clearCompleted,
  deleteList,
  deletedMessage,
  emptyDeleted,
  forgetDeleted,
  isBlank,
  normalize,
  purgeDeleted,
  restoreDeleted,
  tasksFor,
  trashTasks,
  undoDelete,
} from "./model";
import type { SavedData } from "./model";
import type { AppData, Task } from "./types";

/** Loads hand-written test data, which leaves fields out on purpose. */
const load = (raw: unknown) => normalize(raw as SavedData);

const now = new Date(2026, 10, 15, 12, 0);

function data(): AppData {
  const t = (id: string, listId: string, over: Partial<Task> = {}): Partial<Task> => ({
    id,
    listId,
    title: id,
    dueAt: "2026-11-16T09:00:00.000Z",
    ...over,
  });
  return load({
    lists: [
      { id: "home", name: "Home", color: "blue", icon: "home", sections: [] },
      { id: "work", name: "Work", color: "red", icon: "work", sections: ["Mine"] },
    ],
    tasks: [
      t("a", "home"),
      t("b", "work", { section: "Mine", streak: 3, snoozedUntil: "2026-11-15T13:00:00.000Z", repeat: "daily" }),
      t("c", "home", { completed: true, completedAt: now.toISOString() }),
      t("d", "work"),
      t("e", "home", { completed: true, completedAt: now.toISOString() }),
    ],
  });
}

const ids = (d: AppData) => d.tasks.map((t) => t.id);

describe("deleting reminders", () => {
  it("moves a reminder to Recently deleted as it was", () => {
    const before = data();
    const d = trashTasks(before, ["b"], now, "x");
    expect(ids(d)).toEqual(["a", "c", "d", "e"]);
    expect(d.deleted).toHaveLength(1);
    expect(d.deleted[0].tasks[0]).toEqual(before.tasks[1]);
    expect(d.deleted[0].deletedAt).toBe(now.toISOString());
    expect(deletedMessage(d, "x")).toBe("Deleted “b”");
  });

  it("drops reminders nobody filled in", () => {
    const blank = load({ tasks: [{ id: "z", title: " " }] });
    expect(isBlank(blank.tasks[0])).toBe(true);
    const d = trashTasks(blank, ["z"], now, "x");
    expect(d.tasks).toHaveLength(0);
    expect(d.deleted).toHaveLength(0);
    expect(deletedMessage(d, "x")).toBeNull();
  });

  it("keeps the title a reminder had before it was cleared", () => {
    const d = trashTasks(updateTitle(data(), "a", ""), ["a"], now, "x", { title: "Call mom" });
    expect(d.deleted[0].tasks[0].title).toBe("Call mom");
  });

  it("clears completed reminders into one batch", () => {
    const d = clearCompleted(data(), { kind: "list", id: "home" }, now, "x");
    expect(ids(d)).toEqual(["a", "b", "d"]);
    expect(d.deleted.map((e) => e.tasks[0].id).sort()).toEqual(["c", "e"]);
    expect(deletedMessage(d, "x", true)).toBe("Cleared 2 completed reminders");
  });

  it("keeps a deleted list with its reminders", () => {
    const d = deleteList(data(), "work", now, "x");
    expect(d.lists.map((l) => l.id)).toEqual(["home"]);
    expect(ids(d)).toEqual(["a", "c", "e"]);
    expect(d.deleted[0].list?.name).toBe("Work");
    expect(d.deleted[0].tasks.map((t) => t.id)).toEqual(["b", "d"]);
    expect(deletedMessage(d, "x")).toBe("Deleted list “Work” and 2 reminders");
  });

  it("leaves deleted reminders out of lists and counts", () => {
    const d = trashTasks(data(), ["a"], now, "x");
    expect(tasksFor(d, { kind: "smart", id: "all" }, now, false).map((t) => t.id)).not.toContain("a");
    expect(tasksFor(d, { kind: "search", query: "a" }, now, true)).toHaveLength(0);
  });
});

describe("undo", () => {
  it("puts cleared reminders back where they were", () => {
    const before = data();
    const d = clearCompleted(before, { kind: "list", id: "home" }, now, "x");
    expect(undoDelete(d, "x")).toEqual(before);
  });

  it("puts a deleted list and its reminders back where they were", () => {
    const before = data();
    const d = deleteList(trashTasks(before, [], now, "y"), "home", now, "x");
    const back = undoDelete(d, "x");
    expect(back.lists).toEqual(before.lists);
    expect(back.tasks).toEqual(before.tasks);
    expect(back.deleted).toHaveLength(0);
  });

  it("only undoes its own batch", () => {
    const d = trashTasks(trashTasks(data(), ["a"], now, "one"), ["d"], now, "two");
    const back = undoDelete(d, "two");
    expect(ids(back)).toEqual(["b", "c", "d", "e"]);
    expect(back.deleted.map((e) => e.batch)).toEqual(["one"]);
  });
});

describe("Recently deleted", () => {
  it("lists newest first", () => {
    const d = trashTasks(trashTasks(data(), ["a"], now, "one"), ["d"], new Date(now.getTime() + 1000), "two");
    expect(d.deleted.map((e) => e.tasks[0].id)).toEqual(["d", "a"]);
  });

  it("restores a reminder at the end of its list, as it was", () => {
    const before = data();
    const d = trashTasks(before, ["b"], now, "x");
    const back = restoreDeleted(d, d.deleted[0].id);
    expect(ids(back)).toEqual(["a", "c", "d", "e", "b"]);
    expect(back.tasks.at(-1)).toEqual(before.tasks[1]);
    expect(back.deleted).toHaveLength(0);
  });

  it("restores into the first list when the reminder's list is gone", () => {
    let d = trashTasks(data(), ["b"], now, "x");
    const entry = d.deleted[0].id;
    d = deleteList(d, "work", now, "y");
    const back = restoreDeleted(d, entry);
    const b = back.tasks.find((t) => t.id === "b")!;
    expect(b.listId).toBe("home");
    expect(b.section).toBeNull();
  });

  it("restores a list with its reminders", () => {
    const d = deleteList(data(), "work", now, "x");
    const back = restoreDeleted(d, d.deleted[0].id);
    expect(back.lists.map((l) => l.id)).toEqual(["home", "work"]);
    expect(back.tasks.filter((t) => t.listId === "work").map((t) => t.id)).toEqual(["b", "d"]);
  });

  it("deletes one for good, or all of them", () => {
    const d = trashTasks(data(), ["a", "d"], now, "x");
    expect(forgetDeleted(d, d.deleted[0].id).deleted).toHaveLength(1);
    expect(emptyDeleted(d).deleted).toHaveLength(0);
  });

  it("forgets things after 30 days", () => {
    const d = trashTasks(data(), ["a"], now, "x");
    expect(purgeDeleted(d, new Date(now.getTime() + 29 * 86_400_000))).toBe(d);
    expect(purgeDeleted(d, new Date(now.getTime() + 31 * 86_400_000)).deleted).toHaveLength(0);
  });

  it("survives saving and loading, and drops unreadable entries", () => {
    const d = deleteList(trashTasks(data(), ["a"], now, "x"), "work", now, "y");
    const loaded = load(JSON.parse(JSON.stringify(d)));
    expect(loaded.deleted).toEqual(d.deleted);
    const junk = load({ deleted: [null, { deletedAt: "nope" }, { deletedAt: now.toISOString(), tasks: [] }] });
    expect(junk.deleted).toEqual([]);
    expect(load({}).deleted).toEqual([]);
  });
});

function updateTitle(d: AppData, id: string, title: string): AppData {
  return { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, title } : t)) };
}
