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
}

const OFF: CoachState = { enabled: false, watching: false, paused: false, label: "" };

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

/** The Pause choices, or Resume while paused. */
function pauseItems(state: CoachState) {
  const pause = (minutes: number | null) => invoke("coach_pause", { minutes }).catch(() => {});
  return state.paused
    ? [{ label: "Resume Coach", onSelect: () => invoke("coach_resume").catch(() => {}) }]
    : [
        { label: "Pause for 15 minutes", onSelect: () => pause(15) },
        { label: "Pause for 1 hour", onSelect: () => pause(60) },
        { label: "Pause for the rest of the day", onSelect: () => pause(null) },
      ];
}

/** The sidebar's one-line Coach bar, above the timer. Hidden while Coach is off. */
export function CoachBar({ rail }: { rail: boolean }) {
  const state = useCoachState();
  if (!state.enabled) return null;
  const text = `Coach: ${state.label}`;
  const trigger = rail ? (
    <button className={`icon-btn coach-rail${state.watching ? " watching" : ""}`} aria-label={`${text}. Pause or resume`}>
      <Coach size={18} />
    </button>
  ) : (
    <button className={`side-strip coach-strip${state.watching ? " watching" : ""}${state.paused ? " paused" : ""}`} aria-label={`${text}. Pause or resume`}>
      <Coach size={14} />
      <span className="side-strip-text">
        <b>Coach</b> · {state.label}
      </span>
      <span className="coach-strip-action">{state.paused ? "Resume" : "Pause"}</span>
    </button>
  );
  const menu = <Menu align="start" trigger={trigger} items={pauseItems(state)} />;
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
            <button className={`icon-btn coach-float${state.watching ? " watching" : ""}`} aria-label={`Coach: ${state.label}. Pause or resume`}>
              <Coach size={16} />
            </button>
          }
          items={pauseItems(state)}
        />
      </span>
    </Tip>
  );
}
