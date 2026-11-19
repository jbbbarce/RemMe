import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Coach, Dismiss } from "../icons";
import { fill, pickLine } from "../coachLines";
import type { AppData } from "../types";

/** A step of the ladder, as Rust sends it. */
interface CoachStep {
  step: "nudge" | "push";
  named: { id: string; title: string } | null;
  distraction: string | null;
  realTalk: boolean;
}

const RECENT_KEY = "remme.coach.recent";
/** A Nudge you don't answer goes away by itself; a Push stays. */
const NUDGE_MS = 30_000;

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Coach's sound: two low notes for the Push, distinct from the timer's chime. */
function playPush() {
  try {
    const audio = new AudioContext();
    const start = audio.currentTime;
    [392, 294].forEach((frequency, i) => {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.type = "triangle";
      tone.frequency.value = frequency;
      const at = start + i * 0.22;
      volume.gain.setValueAtTime(0, at);
      volume.gain.linearRampToValueAtTime(0.18, at + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 0.75);
    });
    window.setTimeout(() => audio.close(), 1500);
  } catch {
    // No sound available; the popup still shows.
  }
}

/** The Coach popup window: one Nudge or Push at a time. */
export function CoachApp({ data }: { data: AppData }) {
  const [step, setStep] = useState<CoachStep | null>(null);
  const [line, setLine] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const ownLines = data.settings.coach.realTalkLines;
  const ownRef = useRef(ownLines);
  ownRef.current = ownLines;

  useEffect(() => {
    const unlisten = listen<CoachStep>("coach-step", ({ payload }) => {
      const recent = readRecent();
      const ctx = { reminder: payload.named?.title ?? null, distraction: payload.distraction, realTalk: payload.realTalk, ownLines: ownRef.current };
      const next = pickLine(payload.step, ctx, recent);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify([next, ...recent].slice(0, 3)));
      } catch {
        // Not repeating lines is a nicety only.
      }
      setStep(payload);
      setLine(fill(next, ctx));
      window.clearTimeout(timer.current);
      if (payload.step === "push") playPush();
      else timer.current = window.setTimeout(() => answer("dismiss", null), NUDGE_MS);
    });
    return () => {
      window.clearTimeout(timer.current);
      unlisten.then((stop) => stop(), () => {});
    };
  }, []);

  const answer = (kind: "back" | "focus" | "dismiss", taskId: string | null) => {
    window.clearTimeout(timer.current);
    setStep(null);
    invoke("coach_answer", { answer: kind, taskId }).catch(() => {});
  };

  if (!step) return null;
  const id = step.named?.id ?? null;
  const push = step.step === "push";
  return (
    <div
      className={`coach-card ${step.step}${step.realTalk && push ? " real-talk" : ""}`}
      role="alertdialog"
      aria-label="Coach"
      aria-describedby="coach-line"
      onKeyDown={(e) => !push && e.key === "Escape" && answer("dismiss", id)}
    >
      <header className="coach-head">
        <Coach size={16} />
        <span className="coach-name">Coach{step.realTalk && push ? " · real talk" : ""}</span>
        {!push && (
          <button className="icon-btn" aria-label="Dismiss" onClick={() => answer("dismiss", id)}>
            <Dismiss size={13} />
          </button>
        )}
      </header>
      <p className="coach-line" id="coach-line">
        {line}
      </p>
      {step.named && <span className="coach-reminder">{step.named.title}</span>}
      <div className="coach-actions">
        <button className="btn primary" onClick={() => answer("back", id)}>
          Back to it
        </button>
        <button className="btn" onClick={() => answer("focus", id)}>
          Start focus
        </button>
        {push && (
          <button className="btn subtle" onClick={() => answer("dismiss", id)}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
