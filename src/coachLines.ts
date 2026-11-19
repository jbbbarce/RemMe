/**
 * What Coach says. Firm but friendly, blunter in real talk: about your time, goals and choices,
 * never insults, swearing, or anything about self-worth. Keep lines short enough for the popup
 * (and, later, to be spoken). {reminder} is the named reminder's title, {distraction} the distraction's name.
 */

export type LineStep = "nudge" | "push";

const NUDGE = [
  "Hey, {reminder} is due. Back to it?",
  "Quick check: {reminder} is waiting.",
  "This is your focus time. {reminder} next?",
  "Drifting a bit? {reminder} is still on the list.",
  "Small reset: close {distraction} and open {reminder}.",
  "{distraction} can wait. {reminder} can't.",
  "One step back to {reminder}. You've got this.",
  "Let's not lose the afternoon. {reminder}?",
];

const PUSH = [
  "Still on {distraction}. {reminder} won't do itself.",
  "Five minutes on {distraction}. Time to switch back.",
  "You planned this time for {reminder}. Use it.",
  "{reminder} is still waiting. Close {distraction}.",
  "This is the moment you decide. Back to {reminder}.",
  "Not later. Now. {reminder}.",
  "{distraction} again? {reminder} is due.",
  "Get back to {reminder}. The rest can wait.",
];

const REAL_TALK = [
  "How can you have dreams if you ain't even doing anything?",
  "Twenty minutes. Gone. {reminder} is still waiting.",
  "Nobody's coming to do this for you.",
  "You said this mattered. Act like it.",
  "The version of you that you want doesn't spend today on {distraction}.",
  "Every minute here is a minute you don't get back.",
  "You're not tired. You're avoiding {reminder}.",
  "Discipline is doing it when you don't feel like it. Now.",
  "Wishing won't finish {reminder}. Working will.",
  "Your goals don't care about {distraction}.",
  "Later is how nothing gets done.",
  "Be honest: is this getting you where you want to go?",
  "Stop scrolling. Start {reminder}.",
  "You've done hard things before. Do this one.",
  "Close it. Open {reminder}. Go.",
];

/** Lines with no reminder to name. */
const GENERAL = [
  "This is your focus time. Pick something to work on.",
  "Focus time. What are you working on right now?",
  "You set this time aside. Spend it on purpose.",
];

/** Lines for when you've gone quiet rather than wandered off. */
const IDLE = [
  "You've gone quiet. Still working on {reminder}?",
  "Still there? {reminder} is waiting.",
  "No sign of you for a while. Back to {reminder}?",
];

export interface LineContext {
  reminder: string | null;
  distraction: string | null;
  realTalk: boolean;
  /** Your own real-talk lines from Settings. */
  ownLines?: string[];
}

/** The reminder's title, kept short enough for one line. */
function short(title: string): string {
  const t = title.trim();
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}

/** Every line that fits this step and what Coach knows right now. */
export function linesFor(step: LineStep, ctx: LineContext): string[] {
  const base =
    ctx.realTalk && step === "push"
      ? [...REAL_TALK, ...(ctx.ownLines ?? [])]
      : ctx.distraction === null && ctx.reminder !== null
        ? IDLE
        : step === "nudge"
          ? NUDGE
          : PUSH;
  // Drop lines that need a name Coach doesn't have.
  const fits = base.filter((l) => (ctx.reminder !== null || !l.includes("{reminder}")) && (ctx.distraction !== null || !l.includes("{distraction}")));
  return fits.length ? fits : GENERAL;
}

/** Fills in a line's names. */
export function fill(line: string, ctx: LineContext): string {
  return line.replaceAll("{reminder}", ctx.reminder ? short(ctx.reminder) : "your work").replaceAll("{distraction}", ctx.distraction ?? "that");
}

/**
 * A line for this step that isn't one of the `recent` ones (the last few shown), filled in.
 * `random` is for tests.
 */
export function pickLine(step: LineStep, ctx: LineContext, recent: readonly string[], random = Math.random): string {
  const all = linesFor(step, ctx);
  const fresh = all.filter((l) => !recent.includes(l));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(random() * pool.length) % pool.length];
}
