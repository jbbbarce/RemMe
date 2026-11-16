import { describe, expect, it } from "vitest";
import { changeMessage, completedMessage, moveTask, normalize, restoreSnapshot, setCompleted, snapshot, updateTask } from "./model";
import type { SavedData } from "./model";
import type { AppData } from "./types";

const now = new Date(2026, 10, 16, 12, 0);
const load = (raw: unknown) => normalize(raw as SavedData);

function data(): AppData {
  return load({
    lists: [
      { id: "home", name: "Home", color: "blue", icon: "home", sections: [] },
      { id: "school", name: "School", color: "red", icon: "school", sections: ["Exams"] },
    ],
    tasks: [
      { id: "a", listId: "home", title: "Pay rent" },
      { id: "b", listId: "home", title: "Buy milk" },
      { id: "c", listId: "school", title: "Revise", section: "Exams" },
      { id: "d", listId: "home", title: "Water plants", dueAt: new Date(2026, 10, 16, 9).toISOString(), repeat: "weekly" },
    ],
  });
}
const ids = (d: AppData) => d.tasks.map((t) => t.id);

describe("dragging reminders", () => {
  it("moves a reminder before or after another", () => {
    expect(ids(moveTask(data(), "a", "b", true))).toEqual(["b", "a", "c", "d"]);
    expect(ids(moveTask(data(), "d", "a", false))).toEqual(["d", "a", "b", "c"]);
  });

  it("joins the list and section of the reminder it lands next to", () => {
    const moved = moveTask(data(), "a", "c", false).tasks.find((t) => t.id === "a")!;
    expect(moved.listId).toBe("school");
    expect(moved.section).toBe("Exams");
  });

  it("does nothing when dropped on itself or on a reminder that's gone", () => {
    const d = data();
    expect(moveTask(d, "a", "a", false)).toBe(d);
    expect(moveTask(d, "a", "zzz", false)).toBe(d);
  });
});

describe("undoing changes", () => {
  it("puts changed reminders back as they were and where they were", () => {
    const before = data();
    const snap = snapshot(before, ["a"]);
    const changed = moveTask(updateTask(before, "a", { priority: 3, dueAt: now.toISOString() }), "a", "d", true);
    expect(restoreSnapshot(changed, snap)).toEqual(before);
  });

  it("undoes ticking off a repeating reminder, taking back the next one", () => {
    const before = data();
    const done = setCompleted(before, "d", true, now);
    expect(done.tasks).toHaveLength(5);
    const back = setCompleted(done, "d", false, new Date(now.getTime() + 5000));
    expect(back.tasks).toHaveLength(4);
    expect(back.tasks.find((t) => t.id === "d")).toMatchObject({ completed: false, repeat: "weekly" });
  });
});

describe("undo toast wording", () => {
  it("names what a quick change did", () => {
    const d = data();
    expect(changeMessage(d, "a", { listId: "school", section: null }, now)).toBe("Moved “Pay rent” to School");
    expect(changeMessage(d, "c", { section: null }, now)).toBe("Moved “Revise” to Others");
    expect(changeMessage(d, "a", { dueAt: new Date(2026, 10, 17, 9).toISOString(), dueHasTime: false }, now)).toBe("“Pay rent” is due Tomorrow");
    expect(changeMessage(d, "d", { dueAt: null, dueHasTime: false, repeat: null, nagMinutes: null }, now)).toBe("Removed the date from “Water plants”");
    expect(changeMessage(d, "a", { priority: 3 }, now)).toBe("Set “Pay rent” to High priority");
    expect(changeMessage(d, "a", { flagged: true }, now)).toBe("Flagged “Pay rent”");
    expect(completedMessage(d, "b")).toBe("Completed “Buy milk”");
  });

  it("says nothing when nothing worth undoing changed", () => {
    expect(changeMessage(data(), "a", { listId: "home", section: null }, now)).toBeNull();
    expect(changeMessage(data(), "zzz", { priority: 2 }, now)).toBeNull();
  });
});
