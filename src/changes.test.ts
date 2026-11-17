import { describe, expect, it } from "vitest";
import { changeManyMessage, changeMessage, completedMessage, dayGroups, emptyMessage, moveTask, normalize, restoreSnapshot, setCompleted, snapshot, updateTask, updateTasks } from "./model";
import type { SavedData } from "./model";
import { canSnooze, snoozeUntil } from "./dates";
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

describe("changing several reminders at once", () => {
  it("moves each to the chosen day, keeping its own time", () => {
    const d = updateTask(data(), "a", { dueAt: new Date(2026, 10, 16, 17, 30).toISOString(), dueHasTime: true });
    const next = updateTasks(d, ["a", "b"], { dueAt: new Date(2026, 10, 17, 9).toISOString(), dueHasTime: false });
    const [a, b] = ["a", "b"].map((id) => next.tasks.find((t) => t.id === id)!);
    expect(new Date(a.dueAt!)).toEqual(new Date(2026, 10, 17, 17, 30));
    expect(a.dueHasTime).toBe(true);
    expect(new Date(b.dueAt!)).toEqual(new Date(2026, 10, 17, 9));
    expect(b.dueHasTime).toBe(false);
  });

  it("can be undone in one go", () => {
    const d = data();
    const snap = snapshot(d, ["a", "c"]);
    const moved = updateTasks(d, ["a", "c"], { listId: "school", section: null });
    expect(moved.tasks.filter((t) => t.listId === "school").length).toBe(2);
    expect(restoreSnapshot(moved, snap)).toEqual(d);
  });

  it("says what changed", () => {
    const d = data();
    expect(changeManyMessage(d, ["a", "b"], { listId: "school", section: null }, now)).toBe("Moved 2 reminders to School");
    expect(changeManyMessage(d, ["a", "b"], { flagged: true }, now)).toBe("Flagged 2 reminders");
    expect(changeManyMessage(d, ["a", "b"], { dueAt: null }, now)).toBe("Removed the date from 2 reminders");
    expect(changeManyMessage(d, ["a"], { flagged: true }, now)).toBe("Flagged “Pay rent”");
  });
});

describe("day groups in Today and Upcoming", () => {
  const at = (day: number, hour: number, hasTime = true) => ({ dueAt: new Date(2026, 10, day, hour).toISOString(), dueHasTime: hasTime });
  const task = (id: string, due: ReturnType<typeof at>) => ({ ...data().tasks[0], id, ...due });

  it("puts overdue first, then each day", () => {
    const groups = dayGroups(
      [task("today9", at(16, 9, false)), task("late", at(16, 10)), task("tomorrow", at(17, 8)), task("fri", at(20, 8)), task("dec", at(40, 8))],
      now,
    );
    expect(groups.map((g) => [g.title, g.tasks.map((t) => t.id)])).toEqual([
      ["Overdue", ["late"]],
      ["Today", ["today9"]],
      ["Tomorrow", ["tomorrow"]],
      ["Friday", ["fri"]],
      ["December", ["dec"]],
    ]);
  });

  it("keeps a reminder just ticked off in its group", () => {
    const done = { ...task("late", at(16, 10)), completed: true };
    expect(dayGroups([done], now)[0].title).toBe("Overdue");
  });
});

describe("snoozing from the app", () => {
  it("snoozes for a while or until 9:00 tomorrow", () => {
    expect(snoozeUntil(10, now)).toEqual(new Date(2026, 10, 16, 12, 10));
    expect(snoozeUntil("tomorrow", now)).toEqual(new Date(2026, 10, 17, 9, 0));
  });

  it("is offered on unfinished reminders due by tonight", () => {
    const due = (d: Date) => ({ dueAt: d.toISOString(), completed: false });
    expect(canSnooze(due(new Date(2026, 10, 15, 9)), now)).toBe(true);
    expect(canSnooze(due(new Date(2026, 10, 16, 23)), now)).toBe(true);
    expect(canSnooze(due(new Date(2026, 10, 17, 9)), now)).toBe(false);
    expect(canSnooze({ ...due(now), completed: true }, now)).toBe(false);
    expect(canSnooze({ dueAt: null, completed: false }, now)).toBe(false);
  });

  it("says when the popup comes back", () => {
    const until = new Date(2026, 10, 16, 13, 0).toISOString();
    expect(changeMessage(data(), "a", { snoozedUntil: until }, now)).toMatch(/^Snoozed “Pay rent” until 1:00/);
    expect(changeMessage(data(), "a", { snoozedUntil: null }, now)).toBe("Stopped snoozing “Pay rent”");
    expect(changeManyMessage(data(), ["a", "b"], { snoozedUntil: until }, now)).toMatch(/^Snoozed 2 reminders until 1:00/);
  });
});

describe("empty views", () => {
  it("say what would show up and how", () => {
    expect(emptyMessage({ kind: "smart", id: "today" }).title).toBe("Nothing due today");
    expect(emptyMessage({ kind: "smart", id: "flagged" }).hint).toContain("choose Flag");
    expect(emptyMessage({ kind: "list", id: "home" }).title).toBe("This list is empty");
    expect(emptyMessage({ kind: "search", query: " milk " }).title).toBe("No results for “milk”");
  });

  it("point to Show done when finished reminders are hidden", () => {
    expect(emptyMessage({ kind: "list", id: "home" }, 1)).toEqual({
      title: "All done here",
      hint: "1 finished reminder is hidden. Turn on Show done to see it.",
    });
    expect(emptyMessage({ kind: "search", query: "x" }, 3).hint).toBe("3 finished reminders are hidden. Turn on Show done to see them.");
  });
});
