import { describe, expect, it } from "vitest";
import { fill, linesFor, pickLine } from "./coachLines";

const ctx = { reminder: "Lab report", distraction: "YouTube", realTalk: false };

describe("Coach's lines", () => {
  it("fill in the reminder and distraction", () => {
    expect(fill("Still on {distraction}. {reminder} won't do itself.", ctx)).toBe("Still on YouTube. Lab report won't do itself.");
    expect(fill("{reminder}", { ...ctx, reminder: "x".repeat(60) })).toHaveLength(40);
  });

  it("skip lines that need a reminder when there isn't one", () => {
    const lines = linesFor("nudge", { reminder: null, distraction: "YouTube", realTalk: false });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => !l.includes("{reminder}"))).toBe(true);
  });

  it("use idle lines when you've gone quiet, and general ones with nothing to name", () => {
    expect(linesFor("nudge", { reminder: "Lab report", distraction: null, realTalk: false }).every((l) => !l.includes("{distraction}"))).toBe(true);
    expect(linesFor("push", { reminder: null, distraction: null, realTalk: false })[0]).toContain("focus time");
  });

  it("use real talk only for the Push, with your own lines added", () => {
    const own = "Future you is watching.";
    const real = linesFor("push", { ...ctx, realTalk: true, ownLines: [own] });
    expect(real).toContain(own);
    expect(real).toContain("How can you have dreams if you ain't even doing anything?");
    expect(linesFor("nudge", { ...ctx, realTalk: true, ownLines: [own] })).not.toContain(own);
  });

  it("don't repeat a recent line while others are left", () => {
    const all = linesFor("nudge", ctx);
    const recent = all.slice(0, all.length - 1);
    expect(pickLine("nudge", ctx, recent, () => 0)).toBe(all.at(-1));
    // With every line recent, it still picks one.
    expect(all).toContain(pickLine("nudge", ctx, all, () => 0.5));
  });

  it("keep every line short and free of swearing", () => {
    const lines = [true, false].flatMap((realTalk) => (["nudge", "push"] as const).flatMap((s) => linesFor(s, { ...ctx, realTalk })));
    for (const l of lines) {
      expect(fill(l, ctx).length).toBeLessThanOrEqual(90);
      expect(/\b(damn|hell|shit|fuck|stupid|idiot|loser|worthless)\b/i.test(l)).toBe(false);
    }
  });
});
