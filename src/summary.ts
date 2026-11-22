/**
 * The daily summary: formatting Coach's totals for the card. Pure, so it can be tested.
 * Times arrive in seconds; distractions and work are keyed by list name (never window titles).
 */

export interface SummaryCounts {
  nudges: number;
  pushes: number;
  takeovers: number;
  snoozes: number;
  breaks: number;
}

export interface SummaryDay {
  date: string;
  focus: number;
  onTrack: number;
  distractions: Record<string, number>;
  idle: number;
  work: Record<string, number>;
  breaks: number;
  paused: number;
  off: number;
  counts: SummaryCounts;
  realTalk: boolean;
}

/** What Rust sends with `coach-summary`. */
export interface Summary {
  which: "today" | "yesterday";
  /** Today, with focus hours still to come (or none). */
  soFar: boolean;
  /** "Monday 23 November". */
  date: string;
  day: SummaryDay;
  notRunning: number;
  /** On track (work included) as a share of the time Coach watched, 0 to 100. */
  percent: number | null;
  /** Real talk is on in Settings. */
  realTalk: boolean;
}

/** "1 h 10 min", "2 h", "32 min", or "" under a minute. */
export function formatDuration(secs: number): string {
  const minutes = Math.floor(secs / 60);
  if (minutes < 1) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The biggest few entries over a minute, biggest first, and how many more there are. */
export function topEntries(entries: Record<string, number>, limit = 3): { shown: [string, number][]; more: number } {
  const all = Object.entries(entries)
    .filter(([, secs]) => secs >= 60)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

export type Band = "good" | "ok" | "low";

/** 80 % or more is a good day, under 50 % a low one. */
export function bandOf(percent: number | null): Band | null {
  if (percent === null) return null;
  return percent >= 80 ? "good" : percent >= 50 ? "ok" : "low";
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "6 nudges · 2 pushes · 1 takeover · 1 snooze · 1 break", leaving out the zeros. */
export function countsLine(c: SummaryCounts): string {
  return [
    c.nudges && plural(c.nudges, "nudge"),
    c.pushes && (c.pushes === 1 ? "1 push" : `${c.pushes} pushes`),
    c.takeovers && plural(c.takeovers, "takeover"),
    c.snoozes && plural(c.snoozes, "snooze"),
    c.breaks && plural(c.breaks, "break"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The card's rows of totals as [label, value], leaving out anything under a minute. */
export function totalRows(s: Summary): [string, string][] {
  const d = s.day;
  const rows: [string, string][] = [];
  const add = (label: string, secs: number, extra = "") => {
    const t = formatDuration(secs);
    if (t) rows.push([label, t + extra]);
  };
  add("Focus time", d.focus);
  add("On track", d.onTrack, s.percent === null ? "" : ` · ${s.percent} %`);
  const { shown, more } = topEntries(d.distractions);
  shown.forEach(([name, secs]) => add(name, secs));
  if (more) {
    const rest = Object.values(d.distractions).sort((a, b) => b - a).slice(shown.length);
    add(`+${more} more`, rest.reduce((a, b) => a + b, 0));
  }
  add("Idle", d.idle);
  const work = Object.values(d.work).reduce((a, b) => a + b, 0);
  add("Allowed for work", work);
  add("Breaks", d.breaks);
  return rows;
}

/** The gaps in the day's focus hours, as sentences. */
export function gapLines(s: Summary): string[] {
  const out: string[] = [];
  const add = (secs: number, text: (t: string) => string) => {
    const t = formatDuration(secs);
    if (t) out.push(text(t));
  };
  add(s.day.paused, (t) => `Coach was paused for ${t}.`);
  add(s.day.off, (t) => `Coach was switched off for ${t}.`);
  add(s.notRunning, (t) => `RemMe wasn't running for ${t} of your focus hours.`);
  return out;
}
