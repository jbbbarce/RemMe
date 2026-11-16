import { describe, expect, it } from "vitest";
import { highlightParts, rangeIds, stepId, toggleId } from "./selection";

const order = ["a", "b", "c", "d"];

describe("moving through reminders with the keyboard", () => {
  it("steps up and down and stops at the ends", () => {
    expect(stepId(order, "b", 1)).toBe("c");
    expect(stepId(order, "b", -1)).toBe("a");
    expect(stepId(order, "a", -1)).toBe("a");
    expect(stepId(order, "d", 1)).toBe("d");
  });

  it("starts at the first or last reminder when none is selected", () => {
    expect(stepId(order, null, 1)).toBe("a");
    expect(stepId(order, null, -1)).toBe("d");
    expect(stepId(order, "gone", 1)).toBe("a");
    expect(stepId([], null, 1)).toBeNull();
  });
});

describe("selecting several reminders", () => {
  it("selects a range in either direction", () => {
    expect(rangeIds(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(order, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeIds(order, "gone", "c")).toEqual(["c"]);
  });

  it("toggles one reminder in and out", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("search highlighting", () => {
  it("marks every match, ignoring case", () => {
    expect(highlightParts("Buy milk, more Milk", "milk")).toEqual([
      { text: "Buy ", match: false },
      { text: "milk", match: true },
      { text: ", more ", match: false },
      { text: "Milk", match: true },
    ]);
  });

  it("leaves text without a match or query alone", () => {
    expect(highlightParts("Pay rent", "milk")).toEqual([{ text: "Pay rent", match: false }]);
    expect(highlightParts("Pay rent", "  ")).toEqual([{ text: "Pay rent", match: false }]);
    expect(highlightParts("", "x")).toEqual([]);
  });
});
