import { describe, expect, it } from "vitest";
import { bandOf, countsLine, formatDuration, gapLines, topEntries, totalRows, type Summary } from "./summary";
import { summaryLine } from "./coachLines";

const day = {
  date: "2026-11-23",
  focus: 4 * 3600 + 900,
  onTrack: 3 * 3600 + 600,
  distractions: { YouTube: 32 * 60, Reddit: 10 * 60, steam: 5 * 60, TikTok: 2 * 60, Twitch: 30 },
  idle: 18 * 60,
  work: { YouTube: 20 * 60 },
  breaks: 900,
  paused: 45 * 60,
  off: 0,
  counts: { nudges: 6, pushes: 2, takeovers: 1, snoozes: 1, breaks: 0 },
  realTalk: false,
};
const summary: Summary = { which: "today", soFar: false, date: "Monday 23 November", day, notRunning: 70 * 60, percent: 86, realTalk: true };

describe("The daily summary", () => {
  it("formats durations, dropping anything under a minute", () => {
    expect(formatDuration(59)).toBe("");
    expect(formatDuration(32 * 60 + 40)).toBe("32 min");
    expect(formatDuration(2 * 3600)).toBe("2 h");
    expect(formatDuration(70 * 60)).toBe("1 h 10 min");
  });

  it("shows the top 3 distractions and how many more", () => {
    const { shown, more } = topEntries(day.distractions);
    expect(shown.map(([name]) => name)).toEqual(["YouTube", "Reddit", "steam"]);
    // Twitch is under a minute, so only TikTok is "more".
    expect(more).toBe(1);
  });

  it("picks the band at 80 % and 50 %", () => {
    expect(bandOf(80)).toBe("good");
    expect(bandOf(79)).toBe("ok");
    expect(bandOf(50)).toBe("ok");
    expect(bandOf(49)).toBe("low");
    expect(bandOf(null)).toBeNull();
  });

  it("lists the totals, leaving out zeros", () => {
    const rows = totalRows(summary);
    expect(rows[0]).toEqual(["Focus time", "4 h 15 min"]);
    expect(rows[1]).toEqual(["On track", "3 h 10 min · 86 %"]);
    expect(rows.map(([label]) => label)).toEqual(["Focus time", "On track", "YouTube", "Reddit", "steam", "+1 more", "Idle", "Allowed for work", "Breaks"]);
    expect(rows.find(([label]) => label === "+1 more")?.[1]).toBe("2 min");
  });

  it("counts steps and gaps in plain words", () => {
    expect(countsLine(day.counts)).toBe("6 nudges · 2 pushes · 1 takeover · 1 snooze");
    expect(countsLine({ nudges: 0, pushes: 1, takeovers: 0, snoozes: 0, breaks: 2 })).toBe("1 push · 2 breaks");
    expect(gapLines(summary)).toEqual(["Coach was paused for 45 min.", "RemMe wasn't running for 1 h 10 min of your focus hours."]);
  });

  it("uses real-talk lines only on a low day with real talk on", () => {
    expect(summaryLine("low", true, "4 h", "1 h", () => 0)).toBe("You planned 4 h. You gave it 1 h.");
    expect(summaryLine("low", false, "4 h", "1 h", () => 0)).toBe("Rough day. Tomorrow's a fresh start.");
    expect(summaryLine("good", true, "4 h", "3 h", () => 0)).toBe("Solid day. You did what you said you'd do.");
    // Nothing on track: no line that needs a duration for it.
    expect(summaryLine("low", true, "4 h", "", () => 0)).not.toContain("{focused}");
    expect(summaryLine("low", true, "4 h", "", () => 0)).not.toContain("gave it .");
  });
});
