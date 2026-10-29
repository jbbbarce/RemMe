import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickAdd";

// Tuesday 27 October 2026, 12:00 local time.
const now = new Date(2026, 9, 27, 12, 0);
const local = (month: number, day: number, h = 9, m = 0, year = 2026) => new Date(year, month - 1, day, h, m).toISOString();

describe("quick add", () => {
  it("reads a day and a time", () => {
    expect(parseQuickAdd("Call mom tomorrow 5pm", now)).toEqual({
      title: "Call mom",
      dueAt: local(10, 28, 17),
      dueHasTime: true,
    });
    expect(parseQuickAdd("Standup on Friday at 9:30am", now)).toMatchObject({ title: "Standup", dueAt: local(10, 30, 9, 30) });
    expect(parseQuickAdd("Dinner tonight", now)).toMatchObject({ title: "Dinner", dueAt: local(10, 27, 20) });
  });

  it("gives a date without a time the usual 9:00 date-only due", () => {
    expect(parseQuickAdd("Pay rent next mon", now)).toEqual({ title: "Pay rent", dueAt: local(11, 2), dueHasTime: false });
    expect(parseQuickAdd("Renew passport in 2 weeks", now)).toMatchObject({ dueAt: local(11, 10), dueHasTime: false });
  });

  it("puts a weekday that is today a week ahead", () => {
    expect(parseQuickAdd("Gym tuesday", now).dueAt).toBe(local(11, 3));
  });

  it("reads month and day both ways, rolling past dates into next year", () => {
    expect(parseQuickAdd("Dentist Nov 3rd 2:15 pm", now)).toMatchObject({ title: "Dentist", dueAt: local(11, 3, 14, 15) });
    expect(parseQuickAdd("Birthday 14 March", now).dueAt).toBe(local(3, 14, 9, 0, 2027));
    expect(parseQuickAdd("Bad date feb 30", now)).toEqual({ title: "Bad date feb 30" });
  });

  it("uses today for a bare time, or tomorrow once it has passed", () => {
    expect(parseQuickAdd("Lunch at noon", now).dueAt).toBe(local(10, 28, 12));
    expect(parseQuickAdd("Call at 3", now).dueAt).toBe(local(10, 27, 15));
    expect(parseQuickAdd("Train 18:45", now).dueAt).toBe(local(10, 27, 18, 45));
  });

  it("reads relative hours and minutes as an exact time", () => {
    expect(parseQuickAdd("Check oven in 20 minutes", now)).toMatchObject({ title: "Check oven", dueAt: local(10, 27, 12, 20), dueHasTime: true });
    expect(parseQuickAdd("Stretch in an hour", now).dueAt).toBe(local(10, 27, 13));
  });

  it("reads priority marks", () => {
    expect(parseQuickAdd("File taxes !!! friday", now)).toMatchObject({ title: "File taxes", priority: 3 });
    expect(parseQuickAdd("Wow!", now)).toEqual({ title: "Wow!" });
  });

  it("leaves ordinary words and numbers alone", () => {
    for (const text of ["Buy sun hat", "Read 1984", "Mark the 3 boxes", "Ask May about it"]) {
      expect(parseQuickAdd(text, now)).toEqual({ title: text });
    }
  });

  it("keeps the text when nothing would be left for a title", () => {
    expect(parseQuickAdd("tomorrow", now)).toEqual({ title: "tomorrow" });
  });
});
