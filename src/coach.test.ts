import { describe, expect, it } from "vitest";
import { DEFAULT_COACH, DEFAULT_DISTRACTIONS, FOCUS_PRESETS, coachFrom, hasFocusHours } from "./coach";
import { normalize } from "./model";
import type { SavedData } from "./model";

describe("Coach settings", () => {
  it("start off, with no focus hours and the default distractions", () => {
    const c = normalize({} as SavedData).settings.coach;
    expect(c).toEqual(DEFAULT_COACH);
    expect(c.enabled).toBe(false);
    expect(hasFocusHours(c)).toBe(false);
    expect(c.distractions.some((d) => d.kind === "site" && d.match === "YouTube")).toBe(true);
  });

  it("keep valid focus hours, sorted, at most 3 a day", () => {
    const c = coachFrom({
      focusHours: [
        [],
        [
          { start: "13:00", end: "17:00" },
          { start: "08:00", end: "12:00" },
          { start: "18:00", end: "19:00" },
          { start: "20:00", end: "21:00" },
        ],
      ],
    });
    expect(c.focusHours).toHaveLength(7);
    expect(c.focusHours[1].map((r) => r.start)).toEqual(["08:00", "13:00", "18:00"]);
  });

  it("drop ranges that end before they start or aren't times", () => {
    const c = coachFrom({ focusHours: [[{ start: "17:00", end: "09:00" }, { start: "9am", end: "5pm" }, { start: "09:00", end: "09:00" }]] });
    expect(c.focusHours[0]).toEqual([]);
  });

  it("drop empty, duplicate and unknown distractions", () => {
    const c = coachFrom({
      distractions: [
        { kind: "site", match: " YouTube " },
        { kind: "site", match: "youtube" },
        { kind: "app", match: "" },
        { kind: "game", match: "x" },
        { kind: "app", match: "steam.exe" },
      ],
    });
    expect(c.distractions).toEqual([
      { kind: "site", match: "YouTube" },
      { kind: "app", match: "steam.exe" },
    ]);
    expect(coachFrom({}).distractions).toEqual(DEFAULT_DISTRACTIONS);
  });

  it("keep timings in range, with the Push after the Nudge", () => {
    const c = coachFrom({ idleMinutes: 0, nudgeAfter: 6, pushAfter: 3, realTalkAfter: 2.5 });
    expect(c.idleMinutes).toBe(10);
    expect(c.pushAfter).toBe(7);
    expect(c.realTalkAfter).toBe(20);
  });

  it("keep your own real-talk lines, trimmed", () => {
    expect(coachFrom({ realTalkLines: [" Get up. ", "", 4] }).realTalkLines).toEqual(["Get up."]);
  });

  it("keep the voice choices to the offered voices and sensible ranges", () => {
    const c = coachFrom({ speak: true, voice: "am_fenrir", realTalkVoice: "nope", voiceSpeed: 2, voiceVolume: 55.4 });
    expect(c.speak).toBe(true);
    expect(c.voice).toBe("am_fenrir");
    expect(c.realTalkVoice).toBeNull();
    expect(c.voiceSpeed).toBe(1);
    expect(c.voiceVolume).toBe(55);
    expect(coachFrom({}).speak).toBe(false);
    expect(coachFrom({ voice: "xx" }).voice).toBe("af_heart");
  });

  it("have presets for weekdays and evenings", () => {
    const [weekdays, evenings] = FOCUS_PRESETS;
    expect(weekdays.hours[0]).toEqual([]);
    expect(weekdays.hours[1]).toEqual([{ start: "09:00", end: "17:00" }]);
    expect(evenings.hours.every((d) => d.length === 1)).toBe(true);
  });
});
