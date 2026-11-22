import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Coach, Dismiss } from "../icons";
import { fill, pickLine, summaryLine } from "../coachLines";
import { bandOf, countsLine, formatDuration, gapLines, totalRows, type Summary } from "../summary";
import { speak } from "../voice";
import type { AppData } from "../types";

/** A step of the ladder, as Rust sends it. */
export interface CoachStep {
  step: "nudge" | "push" | "takeover";
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

/** Picks a fresh line for a step, filled in, and remembers it so it isn't repeated soon. */
export function lineFor(payload: CoachStep, ownLines: string[]): string {
  const recent = readRecent();
  const ctx = { reminder: payload.named?.title ?? null, distraction: payload.distraction, realTalk: payload.realTalk, ownLines };
  const next = pickLine(payload.step, ctx, recent);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([next, ...recent].slice(0, 3)));
  } catch {
    // Not repeating lines is a nicety only.
  }
  return fill(next, ctx);
}

/** Plays the Push sound, then speaks `line` if Speak is on (real talk can have its own voice). Returns a stop function. */
export function soundAndSpeak(line: string, realTalk: boolean, c: AppData["settings"]["coach"]): () => void {
  playPush();
  if (!c.speak) return () => {};
  const voice = realTalk && c.realTalkVoice ? c.realTalkVoice : c.voice;
  return speak(line, voice, c.voiceSpeed, c.voiceVolume, 700);
}

/** Coach's sound: two low notes for the Push, distinct from the timer's chime. */
export function playPush() {
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

/** The daily summary card: a quiet report, with no sound or speech. It fits the window to itself. */
function SummaryCard({ summary, onClose }: { summary: Summary; onClose(): void }) {
  const card = useRef<HTMLDivElement>(null);
  const [line] = useState(() => {
    const band = bandOf(summary.percent);
    if (!band) return "No focus time to report yet.";
    return summaryLine(band, summary.realTalk, formatDuration(summary.day.focus - summary.day.breaks), formatDuration(summary.day.onTrack));
  });
  useEffect(() => {
    const height = card.current?.scrollHeight;
    if (height) invoke("coach_fit", { height: height + 2 }).catch(() => {});
  }, [summary]);
  const rows = totalRows(summary);
  const counts = countsLine(summary.day.counts);
  const gaps = gapLines(summary);
  return (
    <div ref={card} className="coach-card summary" role="dialog" aria-label="Coach's daily summary" aria-describedby="summary-line">
      <header className="coach-head">
        <Coach size={16} />
        <span className="coach-name">
          {summary.which === "yesterday" ? "Yesterday" : summary.soFar ? "Today so far" : "Today"} · {summary.date}
        </span>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Dismiss size={13} />
        </button>
      </header>
      <p className="coach-line" id="summary-line">
        {line}
      </p>
      {rows.length > 0 && (
        <dl className="summary-rows">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {counts && <p className="summary-counts">{counts}</p>}
      {gaps.map((g) => (
        <p key={g} className="summary-gap">
          {g}
        </p>
      ))}
      <div className="coach-actions">
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** The Coach popup window: one Nudge or Push at a time, or the daily summary. */
export function CoachApp({ data }: { data: AppData }) {
  const [step, setStep] = useState<CoachStep | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [line, setLine] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const coach = data.settings.coach;
  const ownRef = useRef(coach.realTalkLines);
  ownRef.current = coach.realTalkLines;
  const coachRef = useRef(coach);
  coachRef.current = coach;
  const stopSpeech = useRef<() => void>(() => {});

  useEffect(() => {
    const unlisten = listen<CoachStep>("coach-step", ({ payload }) => {
      const filled = lineFor(payload, ownRef.current);
      setSummary(null);
      setStep(payload);
      setLine(filled);
      window.clearTimeout(timer.current);
      stopSpeech.current();
      if (payload.step === "push") stopSpeech.current = soundAndSpeak(filled, payload.realTalk, coachRef.current);
      else timer.current = window.setTimeout(() => answer("dismiss", null), NUDGE_MS);
    });
    // Its own event, as with the Takeover's.
    const unlistenSummary = listen<Summary>("coach-summary", ({ payload }) => {
      window.clearTimeout(timer.current);
      stopSpeech.current();
      setStep(null);
      setSummary(payload);
    });
    return () => {
      window.clearTimeout(timer.current);
      unlisten.then((stop) => stop(), () => {});
      unlistenSummary.then((stop) => stop(), () => {});
    };
  }, []);

  const closeSummary = () => {
    const which = summary?.which ?? "today";
    setSummary(null);
    invoke("coach_summary_close", { which }).catch(() => {});
  };

  const answer = (kind: "back" | "focus" | "work" | "dismiss", taskId: string | null) => {
    window.clearTimeout(timer.current);
    stopSpeech.current();
    setStep(null);
    invoke("coach_answer", { answer: kind, taskId }).catch(() => {});
  };

  if (summary) return <SummaryCard key={summary.which + summary.date} summary={summary} onClose={closeSummary} />;
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
        {step.distraction && (
          <button className="btn subtle" onClick={() => answer("work", id)} title={`Coach ignores ${step.distraction} for 1 hour`}>
            This is for work
          </button>
        )}
        {push && (
          <button className="btn subtle" onClick={() => answer("dismiss", id)}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
