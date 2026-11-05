import { describe, expect, it } from "vitest";
import { dayKey, itemsByDay, monthGrid, moveToDay, shiftAnchor, undated, weekDays, weekStartDay } from "./calendar";
import { normalize } from "./model";
import { parseQuickAdd } from "./quickAdd";
import type { Task } from "./types";

// Wednesday 4 November 2026, noon.
const now = new Date(2026, 10, 4, 12, 0);
const at = (month: number, day: number, h = 9, m = 0) => new Date(2026, month - 1, day, h, m).toISOString();
const tasks = (list: Partial<Task>[]) => normalize({ tasks: list.map((t, i) => ({ id: `t${i}`, title: `t${i}`, ...t }) as Task) }).tasks;

describe("calendar grids", () => {
  it("starts weeks on the region's first day", () => {
    expect(weekStartDay("en-US")).toBe(0);
    expect(weekStartDay("en-GB")).toBe(1);
  });

  it("lays out six full weeks around the month", () => {
    const sunday = monthGrid(now, 0);
    expect(sunday).toHaveLength(42);
    expect(dayKey(sunday[0])).toBe("2026-11-01");
    const monday = monthGrid(now, 1);
    expect(dayKey(monday[0])).toBe("2026-10-26");
    expect(dayKey(monday[41])).toBe("2026-12-06");
  });

  it("lists a week and moves by months and weeks", () => {
    expect(weekDays(now, 1).map(dayKey)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(dayKey(shiftAnchor(new Date(2026, 0, 31), "month", 1))).toBe("2026-02-01");
    expect(dayKey(shiftAnchor(now, "week", -1))).toBe("2026-10-28");
  });
});

describe("reminders on days", () => {
  const list = tasks([
    { id: "late", dueAt: at(11, 5, 17), dueHasTime: true },
    { id: "allday", dueAt: at(11, 5) },
    { id: "early", dueAt: at(11, 5, 8), dueHasTime: true },
    { id: "done", dueAt: at(11, 5), completed: true },
    { id: "nodate" },
    { id: "daily", dueAt: at(11, 28), repeat: "daily" },
  ]);
  const days = itemsByDay(list, new Date(2026, 10, 1), new Date(2026, 10, 30), false);

  it("puts all-day reminders first, then timed ones by time, and hides done ones", () => {
    expect(days.get("2026-11-05")!.map((i) => i.task.id)).toEqual(["allday", "early", "late"]);
    expect(itemsByDay(list, new Date(2026, 10, 5), new Date(2026, 10, 5), true).get("2026-11-05")).toHaveLength(4);
  });

  it("shows a repeat's later dates faded, only within the range", () => {
    expect(days.get("2026-11-28")![0]).toMatchObject({ faded: false });
    expect(["2026-11-29", "2026-11-30"].map((k) => days.get(k)![0].faded)).toEqual([true, true]);
    expect(days.has("2026-12-01")).toBe(false);
  });

  it("lists undated reminders for the No date column", () => {
    expect(undated(list, false).map((t) => t.id)).toEqual(["nodate"]);
  });
});

describe("moving and adding on a day", () => {
  it("keeps the time when moving, and gives undated reminders a date only", () => {
    const [timed, plain] = tasks([{ dueAt: at(11, 5, 17, 30), dueHasTime: true }, {}]);
    expect(moveToDay(timed, new Date(2026, 10, 9))).toEqual({ dueAt: at(11, 9, 17, 30), dueHasTime: true });
    expect(moveToDay(plain, new Date(2026, 10, 9))).toEqual({ dueAt: at(11, 9), dueHasTime: false });
  });

  it("puts a typed time on the clicked day, but a typed date wins", () => {
    const day = new Date(2026, 10, 20);
    expect(parseQuickAdd("Call mom 5pm", now, day).dueAt).toBe(at(11, 20, 17));
    expect(parseQuickAdd("Dentist 8am", now, new Date(2026, 10, 4)).dueAt).toBe(at(11, 4, 8));
    expect(parseQuickAdd("Pay rent tomorrow", now, day).dueAt).toBe(at(11, 5));
    expect(parseQuickAdd("Just a title", now, day).dueAt).toBeUndefined();
  });
});
