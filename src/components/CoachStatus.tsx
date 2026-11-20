import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Coach } from "../icons";
import { Menu, Tip } from "./ui";

/** What Rust says about Coach: on or off, watching, paused, and a line to show. */
export interface CoachState {
  enabled: boolean;
  watching: boolean;
  paused: boolean;
  label: string;
  /** A Takeover is up: Coach's settings and Pause are locked. */
  takeoverUp: boolean;
  snoozesLeft: number;
  /** With no snoozes left, when the next one frees up ("3:40 pm"). */
  nextSnooze: string | null;
  breaksLeft: number;
  /** When the current break ends ("3:15 pm"). */
  breakUntil: string | null;
  /** Distractions allowed for work right now, soonest to end first. */
  work: { entry: string; name: string; until: string }[];
}

const OFF: CoachState = {
  enabled: false,
  watching: false,
  paused: false,
  label: "",
  takeoverUp: false,
  snoozesLeft: 2,
  nextSnooze: null,
  breaksLeft: 3,
  breakUntil: null,
  work: [],
};

/** Coach's state, kept up to date. */
export function useCoachState(): CoachState {
  const [state, setState] = useState<CoachState>(OFF);
  useEffect(() => {
    invoke<CoachState>("coach_state").then(setState, () => {});
    const unlisten = listen<CoachState>("coach-state", (e) => setState(e.payload));
    return () => {
      unlisten.then((stop) => stop(), () => {});
    };
  }, []);
  return state;
}

/** Ending a break, undoing "This is for work", then the Pause choices (or Resume while paused). */
function coachItems(state: CoachState) {
  const pause = (minutes: number | null) => invoke("coach_pause", { minutes }).catch(() => {});
  const extras = [
    ...(state.breakUntil ? [{ label: "End break", onSelect: () => invoke("coach_end_break").catch(() => {}) }] : []),
    ...state.work.map((w) => ({
      label: `Undo: ${w.name} allowed for work`,
      onSelect: () => invoke("coach_work_undo", { entry: w.entry }).catch(() => {}),
    })),
  ];
  // Pause is locked while a Takeover is up.
  const locked = state.takeoverUp;
  const pausing = state.paused
    ? [{ label: "Resume Coach", onSelect: () => invoke("coach_resume").catch(() => {}) }]
    : [
        { label: "Pause for 15 minutes", onSelect: () => pause(15), disabled: locked },
        { label: "Pause for 1 hour", onSelect: () => pause(60), disabled: locked },
        { label: "Pause for the rest of the day", onSelect: () => pause(null), disabled: locked },
      ];
  return [...extras, ...pausing.map((it, i) => ({ ...it, separated: i === 0 && extras.length > 0 }))];
}

/** The bar's action word: what its menu mainly does right now. */
function actionWord(state: CoachState) {
  if (state.paused) return "Resume";
  if (state.breakUntil) return "End break";
  if (state.work.length) return "Undo";
  return "Pause";
}

/** The sidebar's one-line Coach bar, above the timer. Hidden while Coach is off. */
export function CoachBar({ rail }: { rail: boolean }) {
  const state = useCoachState();
  if (!state.enabled) return null;
  const text = `Coach: ${state.label}`;
  const trigger = rail ? (
    <button className={`icon-btn coach-rail${state.watching ? " watching" : ""}`} aria-label={`${text}. Coach menu`}>
      <Coach size={18} />
    </button>
  ) : (
    <button className={`side-strip coach-strip${state.watching ? " watching" : ""}${state.paused ? " paused" : ""}`} aria-label={`${text}. Coach menu`}>
      <Coach size={14} />
      <span className="side-strip-text">
        <b>Coach</b> · {state.label}
      </span>
      <span className="coach-strip-action">{actionWord(state)}</span>
    </button>
  );
  const menu = <Menu align="start" trigger={trigger} items={coachItems(state)} />;
  return rail ? <Tip text={text} side="right">{menu}</Tip> : menu;
}

/** The floating list's Coach button: Pause or Resume, shown while Coach is on. */
export function CoachFloatButton() {
  const state = useCoachState();
  if (!state.enabled) return null;
  return (
    <Tip text={`Coach: ${state.label}`}>
      <span>
        <Menu
          align="end"
          trigger={
            <button className={`icon-btn coach-float${state.watching ? " watching" : ""}`} aria-label={`Coach: ${state.label}. Coach menu`}>
              <Coach size={16} />
            </button>
          }
          items={coachItems(state)}
        />
      </span>
    </Tip>
  );
}
