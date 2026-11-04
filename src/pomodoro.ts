import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TimerPhase, TimerState } from "./types";

const IDLE: TimerState = {
  phase: "idle",
  running: false,
  endsAt: null,
  remaining: 0,
  total: 0,
  taskId: null,
  inSet: 0,
  today: 0,
  day: "",
};

export const PHASE_NAMES: Record<TimerPhase, string> = {
  idle: "Focus",
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

/** The backend's timer, plus the time left right now, updated a few times a second while it runs. */
export function usePomodoro(): TimerState & { left: number } {
  const [timer, setTimer] = useState<TimerState>(IDLE);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    invoke<TimerState>("pomodoro_state").then(setTimer, () => {});
    const unlisten = listen<TimerState>("pomodoro", (event) => setTimer(event.payload));
    return () => {
      unlisten.then((stop) => stop(), () => {});
    };
  }, []);

  useEffect(() => {
    setNow(Date.now());
    if (!timer.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer.running, timer.endsAt]);

  const left = timer.running && timer.endsAt ? Math.max(0, timer.endsAt - now) : timer.remaining;
  return { ...timer, left };
}

export const startFocus = (taskId?: string) => invoke("pomodoro_start", { taskId: taskId ?? null });
export const toggleTimer = () => invoke("pomodoro_toggle");
export const skipTimer = () => invoke("pomodoro_skip");
export const resetTimer = () => invoke("pomodoro_reset");

/** `mm:ss`, rounding up so a session shows 25:00 at its start and 0:01 just before it ends. */
export function formatClock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A short, quiet two-note chime. */
export function playChime() {
  try {
    const audio = new AudioContext();
    const start = audio.currentTime;
    [660, 880].forEach((frequency, i) => {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      const at = start + i * 0.18;
      volume.gain.setValueAtTime(0, at);
      volume.gain.linearRampToValueAtTime(0.12, at + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 0.65);
    });
    window.setTimeout(() => audio.close(), 1200);
  } catch {
    // No sound available; the notification still shows.
  }
}
