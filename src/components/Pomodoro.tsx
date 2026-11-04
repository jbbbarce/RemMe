import { Pause, Play, RotateCcw, SkipForward, Timer } from "lucide-react";
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

/** The timer at the bottom of the main window's sidebar. */
export function PomodoroPanel({ data }: { data: AppData }) {
  const { timer, idle, left, progress, task } = useTimerView(data);
  const label =
    timer.phase === "focus" || idle ? `${PHASE_NAMES.focus} ${Math.min(timer.inSet + 1, 4)} of 4` : PHASE_NAMES[timer.phase];

  return (
    <section className={`timer-panel ${timer.phase}`} aria-label="Pomodoro timer">
      <div className="timer-top">
        <Ring size={44} progress={progress} />
        <div className="timer-read">
          <span className="timer-phase">{label}</span>
          <span className="timer-clock">{formatClock(left)}</span>
        </div>
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
              <SkipForward size={14} />
            </button>
            <button className="icon-btn" aria-label="Stop and reset" title="Reset" onClick={resetTimer}>
              <RotateCcw size={14} />
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
