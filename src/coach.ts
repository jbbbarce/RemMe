import type { CoachSettings, Distraction, FocusRange } from "./types";

/** Coach's starting distraction list: common time sinks, editable in Settings. */
export const DEFAULT_DISTRACTIONS: Distraction[] = [
  ...["YouTube", "Netflix", "TikTok", "Reddit", "Facebook", "Instagram", "Twitter", "x.com", "Twitch"].map(
    (match) => ({ kind: "site" as const, match }),
  ),
  ...["steam.exe", "EpicGamesLauncher.exe", "Discord.exe"].map((match) => ({ kind: "app" as const, match })),
];

export const DEFAULT_COACH: CoachSettings = {
  enabled: false,
  focusHours: [[], [], [], [], [], [], []],
  alsoWhenOverdue: false,
  distractions: DEFAULT_DISTRACTIONS,
  idleMinutes: 10,
  nudgeAfter: 1,
  pushAfter: 5,
  resetAfter: 2,
  realTalk: true,
  realTalkAfter: 20,
  realTalkLines: [],
};

export const MAX_RANGES_PER_DAY = 3;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Quick ways to fill in focus hours. */
export const FOCUS_PRESETS: { label: string; hours: FocusRange[][] }[] = [
  {
    label: "Weekdays 9–5",
    hours: [0, 1, 2, 3, 4, 5, 6].map((d) => (d >= 1 && d <= 5 ? [{ start: "09:00", end: "17:00" }] : [])),
  },
  {
    label: "Every evening 7–10",
    hours: [0, 1, 2, 3, 4, 5, 6].map(() => [{ start: "19:00", end: "22:00" }]),
  },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutes after midnight for an "HH:mm" time. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function validRange(r: unknown): r is FocusRange {
  if (!r || typeof r !== "object") return false;
  const { start, end } = r as FocusRange;
  return typeof start === "string" && typeof end === "string" && TIME.test(start) && TIME.test(end) && minutesOf(end) > minutesOf(start);
}

function minutesIn(value: unknown, fallback: number, max = 120): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
}

/** Coach's settings from a saved file, with anything invalid replaced by its default or dropped. */
export function coachFrom(raw: unknown): CoachSettings {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<CoachSettings>;
  const days = Array.isArray(c.focusHours) ? c.focusHours : [];
  const focusHours = [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const ranges = Array.isArray(days[d]) ? days[d].filter(validRange) : [];
    return ranges.sort((a, b) => minutesOf(a.start) - minutesOf(b.start)).slice(0, MAX_RANGES_PER_DAY);
  });
  const seen = new Set<string>();
  const distractions = Array.isArray(c.distractions)
    ? c.distractions.flatMap((d) => {
        if (!d || (d.kind !== "app" && d.kind !== "site") || typeof d.match !== "string") return [];
        const match = d.match.trim();
        const key = `${d.kind}:${match.toLowerCase()}`;
        if (!match || seen.has(key)) return [];
        seen.add(key);
        return [{ kind: d.kind, match }];
      })
    : DEFAULT_DISTRACTIONS;
  const nudgeAfter = minutesIn(c.nudgeAfter, DEFAULT_COACH.nudgeAfter);
  return {
    enabled: c.enabled === true,
    focusHours,
    alsoWhenOverdue: c.alsoWhenOverdue === true,
    distractions,
    idleMinutes: minutesIn(c.idleMinutes, DEFAULT_COACH.idleMinutes),
    nudgeAfter,
    // The Push always comes after the Nudge.
    pushAfter: Math.max(nudgeAfter + 1, minutesIn(c.pushAfter, DEFAULT_COACH.pushAfter)),
    resetAfter: minutesIn(c.resetAfter, DEFAULT_COACH.resetAfter, 30),
    realTalk: c.realTalk !== false,
    realTalkAfter: minutesIn(c.realTalkAfter, DEFAULT_COACH.realTalkAfter, 240),
    realTalkLines: Array.isArray(c.realTalkLines)
      ? c.realTalkLines.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean).slice(0, 50)
      : [],
  };
}

/** Whether any focus hours are set at all. */
export function hasFocusHours(c: CoachSettings): boolean {
  return c.focusHours.some((day) => day.length > 0);
}
