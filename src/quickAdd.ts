import { startOfDay } from "./dates";
import type { Priority, Repeat, Task } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const ORDINAL = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const FULL_DAY = String.raw`(sunday|monday|tuesday|wednesday|thursday|friday|saturday)`;
const SHORT_DAY = String.raw`(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)`;

/** What a typed title like "Call mom tomorrow 5pm !!" means. Fields that weren't mentioned are left out. */
export type QuickAdd = Pick<Task, "title"> & Partial<Pick<Task, "dueAt" | "dueHasTime" | "priority" | "repeat">>;

/**
 * Reads a date, time and priority out of a reminder title and removes them from it.
 * Understands today, tonight, tomorrow, weekdays, "oct 30", "30 oct", "in 3 days", "in 2 hours",
 * times like 5pm, 5:30 pm, 17:00, "at 6" and noon, `!`, `!!` or `!!!` for priority, and repeats
 * like daily, weekly, "every month" or "every friday". A repeat with no date starts today.
 * If nothing would be left for a title, the text is kept as typed.
 */
export function parseQuickAdd(text: string, now: Date): QuickAdd {
  let rest = ` ${text} `;
  const found: { day?: Date; time?: { h: number; m: number }; exact?: Date; priority?: Priority; repeat?: Repeat } = {};

  const take = (pattern: string, read: (match: RegExpMatchArray) => boolean) => {
    const regex = new RegExp(String.raw`(?<=\s)${pattern}(?=[\s,.!?]|$)`, "i");
    const match = rest.match(regex);
    if (match && read(match)) rest = rest.slice(0, match.index) + " " + rest.slice(match.index! + match[0].length);
  };

  take(String.raw`(!{1,3})`, (m) => {
    found.priority = m[1].length as Priority;
    return true;
  });

  take(String.raw`in\s+(\d+|an?|one)\s+(min(?:ute)?s?|hours?|hrs?|days?|weeks?)`, (m) => {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
    const unit = m[2].toLowerCase();
    if (unit.startsWith("min") || unit.startsWith("h")) {
      found.exact = new Date(now.getTime() + n * (unit.startsWith("min") ? 60_000 : 3_600_000));
    } else {
      found.day = addDays(startOfDay(now), n * (unit.startsWith("w") ? 7 : 1));
    }
    return true;
  });

  const weekday = (name: string) => {
    if (found.day) return false;
    const target = WEEKDAYS.indexOf(name.slice(0, 3).toLowerCase());
    const ahead = (target - now.getDay() + 7) % 7 || 7;
    found.day = addDays(startOfDay(now), ahead);
    return true;
  };
  const REPEAT_WORDS: Record<string, Repeat> = { day: "daily", week: "weekly", month: "monthly", year: "yearly" };
  take(String.raw`(daily|weekly|monthly|yearly|annually)`, (m) => {
    const word = m[1].toLowerCase();
    found.repeat = word === "annually" ? "yearly" : (word as Repeat);
    return true;
  });
  take(String.raw`every\s+(day|week|month|year)`, (m) => {
    if (found.repeat) return false;
    found.repeat = REPEAT_WORDS[m[1].toLowerCase()];
    return true;
  });
  take(String.raw`every\s+(?:${FULL_DAY}|${SHORT_DAY})`, (m) => {
    if (found.repeat) return false;
    found.repeat = "weekly";
    return weekday(m[1] ?? m[2]);
  });

  const monthDay = (month: string, date: string) => {
    const mi = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
    const d = Number(date);
    // A date that already passed this year means next year.
    let year = now.getFullYear();
    if (new Date(year, mi, d) < startOfDay(now)) year += 1;
    if (d < 1 || d > new Date(year, mi + 1, 0).getDate()) return false;
    found.day = new Date(year, mi, d);
    return true;
  };
  take(String.raw`(?:on\s+)?${MONTH}\s+${ORDINAL}`, (m) => !found.day && monthDay(m[1], m[2]));
  take(String.raw`(?:on\s+)?(?:the\s+)?${ORDINAL}\s+(?:of\s+)?${MONTH}`, (m) => !found.day && monthDay(m[2], m[1]));

  take(String.raw`(today|tonight|tomorrow|tmrw?)`, (m) => {
    if (found.day) return false;
    const word = m[1].toLowerCase();
    found.day = word === "today" || word === "tonight" ? startOfDay(now) : addDays(startOfDay(now), 1);
    if (word === "tonight") found.time ??= { h: 20, m: 0 };
    return true;
  });
  take(String.raw`(?:(?:on|next|this)\s+)?${FULL_DAY}`, (m) => weekday(m[1]));
  take(String.raw`(?:on|next|this)\s+${SHORT_DAY}`, (m) => weekday(m[1]));

  take(String.raw`(?:at\s+|@\s*)?(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?`, (m) => {
    const h = Number(m[1]);
    if (h < 1 || h > 12) return false;
    found.time = { h: (h % 12) + (m[3].toLowerCase() === "p" ? 12 : 0), m: Number(m[2] ?? 0) };
    return true;
  });
  take(String.raw`(?:at\s+|@\s*)?([01]?\d|2[0-3]):([0-5]\d)`, (m) => {
    if (found.time) return false;
    found.time = { h: Number(m[1]), m: Number(m[2]) };
    return true;
  });
  take(String.raw`(?:at|@)\s*(\d{1,2})`, (m) => {
    const h = Number(m[1]);
    if (found.time || h < 1 || h > 12) return false;
    // Without am/pm, small hours are more likely afternoon: "at 6" means 6pm.
    found.time = { h: h === 12 ? 12 : h <= 6 ? h + 12 : h, m: 0 };
    return true;
  });
  take(String.raw`(?:at\s+)?(noon|midday)`, () => {
    if (found.time) return false;
    found.time = { h: 12, m: 0 };
    return true;
  });

  const title = rest.replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  if (!title) return { title: text.trim() };

  const result: QuickAdd = { title };
  if (found.priority) result.priority = found.priority;
  if (found.repeat) {
    result.repeat = found.repeat;
    if (!found.day && !found.time && !found.exact) found.day = startOfDay(now);
  }
  if (found.exact) {
    result.dueAt = found.exact.toISOString();
    result.dueHasTime = true;
  } else if (found.time) {
    const base = found.day ?? startOfDay(now);
    let due = new Date(base.getFullYear(), base.getMonth(), base.getDate(), found.time.h, found.time.m);
    // A bare time that already passed today means tomorrow.
    if (!found.day && due <= now) due = addDays(due, 1);
    result.dueAt = due.toISOString();
    result.dueHasTime = true;
  } else if (found.day) {
    result.dueAt = new Date(found.day.getTime() + 9 * 3_600_000).toISOString();
    result.dueHasTime = false;
  }
  return result;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
}
