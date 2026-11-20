import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Coach } from "../icons";
import { lineFor, soundAndSpeak, type CoachStep } from "./CoachApp";
import { useCoachState } from "./CoachStatus";
import type { AppData } from "../types";

/**
 * The Takeover window: a dimmed overlay over the whole screen you're using, which clears only when
 * you pick Start focus, a snooze or a break. Esc and Alt+F4 don't close it (Rust refuses the close).
 */
export function TakeoverApp({ data }: { data: AppData }) {
  const [step, setStep] = useState<CoachStep | null>(null);
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const coach = useCoachState();
  const coachRef = useRef(data.settings.coach);
  coachRef.current = data.settings.coach;
  const stopSpeech = useRef<() => void>(() => {});
  const focusButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Its own event: a page's listen() hears events sent to any window, so the Push must not reach here.
    const unlisten = listen<CoachStep>("coach-takeover", ({ payload }) => {
      const filled = lineFor(payload, coachRef.current.realTalkLines);
      setStep(payload);
      setLine(filled);
      setError(null);
      stopSpeech.current();
      stopSpeech.current = soundAndSpeak(filled, payload.realTalk, coachRef.current);
      window.setTimeout(() => focusButton.current?.focus(), 50);
    });
    return () => {
      stopSpeech.current();
      unlisten.then((stop) => stop(), () => {});
    };
  }, []);

  // The window hides itself when cleared; drop the card so a stale one never flashes next time.
  useEffect(() => {
    if (!coach.takeoverUp) {
      stopSpeech.current();
      setStep(null);
    }
  }, [coach.takeoverUp]);

  const answer = (kind: "focus" | "snooze" | "break") => {
    invoke("coach_answer", { answer: kind, taskId: step?.named?.id ?? null }).then(
      () => {
        stopSpeech.current();
        setStep(null);
      },
      (e) => setError(String(e)),
    );
  };

  if (!step) return <div className="takeover" />;
  const realTalk = step.realTalk;
  const snoozeNote =
    coach.snoozesLeft > 0 ? `${coach.snoozesLeft} left this hour` : coach.nextSnooze ? `No snoozes left until ${coach.nextSnooze}` : "No snoozes left";
  const breakNote = coach.breaksLeft > 0 ? `${coach.breaksLeft} left in this focus time` : "No breaks left in this focus time";
  return (
    <div className="takeover" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}>
      <div className={`takeover-card${realTalk ? " real-talk" : ""}`} role="alertdialog" aria-modal="true" aria-label="Coach" aria-describedby="takeover-line">
        <header className="coach-head">
          <Coach size={18} />
          <span className="coach-name">Coach{realTalk ? " · real talk" : ""}</span>
        </header>
        <p className="takeover-line" id="takeover-line">
          {line}
        </p>
        {step.named && <span className="coach-reminder">{step.named.title}</span>}
        <div className="takeover-actions">
          <button ref={focusButton} className="btn primary" onClick={() => answer("focus")}>
            Start focus
          </button>
          <button className="btn takeover-choice" disabled={coach.snoozesLeft === 0} onClick={() => answer("snooze")}>
            Snooze 5 min
            <small>{snoozeNote}</small>
          </button>
          <button className="btn takeover-choice" disabled={coach.breaksLeft === 0} onClick={() => answer("break")}>
            Take a 15-min break
            <small>{breakNote}</small>
          </button>
        </div>
        {error && (
          <p className="takeover-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
