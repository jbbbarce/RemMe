import { ChevronDown, ChevronUp, Pause, Play, Reset, Skip, Timer } from "../icons";
import { useState } from "react";
import { PHASE_NAMES, formatClock, resetTimer, skipTimer, toggleTimer, usePomodoro } from "../pomodoro";
import type { AppData } from "../types";

function Ring({ size, progress }: { size: number; progress: number }) {
  const r = size / 2 - 3;
  const length = 2 * Math.PI * r;
  return (
    <svg className="timer-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} />
      <circle
        className="timer-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeDasharray={`${length * progress} ${length}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function useTimerView(data: AppData) {
  const timer = usePomodoro();
  const idle = timer.phase === "idle";
  const left = idle ? data.settings.pomodoroFocus * 60_000 : timer.left;
  const progress = idle || timer.total === 0 ? 0 : 1 - timer.left / timer.total;
  const task = data.tasks.find((t) => t.id === timer.taskId);
  return { timer, idle, left, progress, task };
}

const OPEN_KEY = "remme.timer.open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * The timer at the bottom of the main window's sidebar: a one-line bar with the phase, the time
 * left and Start or Pause, which expands to the full panel. Collapsed by default.
 */
export function PomodoroPanel({ data }: { data: AppData }) {
  const { timer, idle, left, progress, task } = useTimerView(data);
  const [open, setOpenState] = useState(readOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(OPEN_KEY, String(next));
    } catch {
      // Remembering this is a convenience only.
    }
  };
  const label =
    timer.phase === "focus" || idle ? `${PHASE_NAMES.focus} ${Math.min(timer.inSet + 1, 4)} of 4` : PHASE_NAMES[timer.phase];

  if (!open) {
    return (
      <div className={`side-strip timer-strip ${timer.phase}`}>
        <button
          className="timer-strip-open"
          aria-expanded={false}
          aria-label={`Focus timer: ${idle ? "not started" : PHASE_NAMES[timer.phase]}, ${formatClock(left)}. Show the timer`}
          title={task ? `On: ${task.title || "Untitled"}` : "Show the timer"}
          onClick={() => setOpen(true)}
        >
          <Ring size={16} progress={progress} />
          <span className="side-strip-text">
            {idle ? "Focus timer" : PHASE_NAMES[timer.phase]} <b className="timer-strip-clock">{formatClock(left)}</b>
          </span>
          <ChevronUp size={13} />
        </button>
        <button
          className="icon-btn"
          aria-label={timer.running ? "Pause" : idle ? "Start a focus session" : "Resume"}
          title={`${timer.running ? "Pause" : idle ? "Start" : "Resume"} (${data.settings.pomodoroShortcut})`}
          onClick={toggleTimer}
        >
          {timer.running ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
    );
  }

  return (
    <section className={`timer-panel ${timer.phase}`} aria-label="Focus timer">
      <div className="timer-top">
        <Ring size={44} progress={progress} />
        <div className="timer-read">
          <span className="timer-phase">{label}</span>
          <span className="timer-clock">{formatClock(left)}</span>
        </div>
        <button className="icon-btn timer-collapse" aria-label="Collapse the timer" title="Collapse" aria-expanded onClick={() => setOpen(false)}>
          <ChevronDown size={13} />
        </button>
      </div>
      {task && <span className="timer-task">On: {task.title || "Untitled"}</span>}
      <div className="timer-actions">
        <button className="timer-main" onClick={toggleTimer}>
          {timer.running ? <Pause size={13} /> : <Play size={13} />}
          {timer.running ? "Pause" : idle ? "Start" : "Resume"}
        </button>
        {!idle && (
          <>
            <button className="icon-btn" aria-label="Skip to the next phase" title="Skip" onClick={skipTimer}>
              <Skip size={14} />
            </button>
            <button className="icon-btn" aria-label="Stop and reset" title="Reset" onClick={resetTimer}>
              <Reset size={14} />
            </button>
          </>
        )}
      </div>
      <span className="timer-today">
        <Timer size={12} /> {timer.today} today
      </span>
    </section>
  );
}

/** The timer in the sidebar's icon rail: its ring, which starts, pauses or resumes. */
export function PomodoroRailButton({ data }: { data: AppData }) {
  const { timer, idle, left, progress } = useTimerView(data);
  const name = idle ? "Start a focus session" : `${PHASE_NAMES[timer.phase]}, ${timer.running ? "running" : "paused"}`;
  return (
    <button
      className={`icon-btn timer-rail ${timer.phase}${timer.running ? " running" : ""}`}
      aria-label={`${name}. ${formatClock(left)} left.`}
      title={`${name}: ${formatClock(left)} (${data.settings.pomodoroShortcut})`}
      onClick={toggleTimer}
    >
      <Ring size={22} progress={progress} />
      <span className="timer-rail-icon">{timer.running ? <Pause size={10} /> : <Play size={10} />}</span>
    </button>
  );
}

/** The timer in the floating list's header: click to start, pause or resume. */
export function PomodoroPill({ data, disabled }: { data: AppData; disabled?: boolean }) {
  const { timer, idle, left, progress } = useTimerView(data);
  const name = idle ? "Start a focus session" : `${PHASE_NAMES[timer.phase]}, ${timer.running ? "running" : "paused"}`;
  return (
    <button
      className={`timer-pill ${timer.phase}${timer.running ? " running" : ""}`}
      aria-label={`${name}. ${formatClock(left)} left.`}
      title={`${name} (${data.settings.pomodoroShortcut})`}
      disabled={disabled}
      onClick={toggleTimer}
    >
      <Ring size={14} progress={progress} />
      {formatClock(left)}
    </button>
  );
}
