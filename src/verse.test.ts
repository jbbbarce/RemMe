import { describe, expect, it } from "vitest";
import { dayOfYear, isMinimized, verseClipboardText, verseFor } from "./verse";
import { VERSES } from "./verses";

describe("dayOfYear", () => {
  it("counts from 1 on 1 January to 365 or 366 on 31 December", () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(366);
  });

  it("ignores the time of day", () => {
    expect(dayOfYear(new Date(2026, 2, 29, 0, 0))).toBe(dayOfYear(new Date(2026, 2, 29, 23, 59)));
  });
});

describe("verseFor", () => {
  it("keeps the same verse all day and changes it at midnight", () => {
    expect(verseFor(new Date(2026, 10, 7, 0, 1))).toBe(verseFor(new Date(2026, 10, 7, 23, 59)));
    expect(verseFor(new Date(2026, 10, 8, 0, 0))).not.toBe(verseFor(new Date(2026, 10, 7, 23, 59)));
  });

  it("gives the same verse for the same date in any year", () => {
    expect(verseFor(new Date(2026, 4, 3))).toBe(verseFor(new Date(2027, 4, 3)));
  });

  it("wraps when there are fewer verses than days", () => {
    const short = [
      { text: "a", ref: "A 1:1" },
      { text: "b", ref: "B 1:1" },
    ];
    expect(verseFor(new Date(2028, 11, 31), short)).toBe(short[1]);
    expect(verseFor(new Date(2028, 11, 30), short)).toBe(short[0]);
  });
});

describe("VERSES", () => {
  it("has a verse for every day of a leap year", () => {
    expect(VERSES.length).toBeGreaterThanOrEqual(366);
  });

  it("has text and a reference for every verse, with no reference twice", () => {
    for (const verse of VERSES) {
      expect(verse.text.trim()).not.toBe("");
      expect(verse.ref).toMatch(/^[1-3A-Z][A-Za-z ]* \d+:\d+(–\d+)?$/);
    }
    expect(new Set(VERSES.map((v) => v.ref)).size).toBe(VERSES.length);
  });

  it("includes verses from the deuterocanonical books", () => {
    const deutero = VERSES.filter((v) => /^(Tobit|Judith|Wisdom|Sirach|Baruch) /.test(v.ref));
    expect(deutero.length).toBeGreaterThanOrEqual(20);
  });

  it("says the LORD, not Yahweh", () => {
    expect(VERSES.some((v) => v.text.includes("Yahweh"))).toBe(false);
  });
});

describe("isMinimized", () => {
  const now = new Date(2026, 10, 7, 15, 0);

  it("is minimized on the day it was minimized", () => {
    expect(isMinimized("2026-11-07", now)).toBe(true);
  });

  it("opens again on a later day or when never minimized", () => {
    expect(isMinimized("2026-11-06", now)).toBe(false);
    expect(isMinimized(null, now)).toBe(false);
  });
});

describe("verseClipboardText", () => {
  it("quotes the text and adds the reference", () => {
    expect(verseClipboardText({ text: "Rejoice always.", ref: "1 Thessalonians 5:16" })).toBe(
      "“Rejoice always.” — 1 Thessalonians 5:16",
    );
  });
});
