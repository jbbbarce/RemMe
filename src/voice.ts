import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Whether Coach's voice is on this PC, as Rust reports it. */
export type VoiceStatus =
  | { state: "none" }
  | { state: "downloading"; done: number; total: number }
  | { state: "ready" }
  | { state: "error"; message: string };

/** About how much the voice download is, for Settings before it starts. */
export const VOICE_DOWNLOAD_MB = 95;

export function useVoiceStatus(): VoiceStatus {
  const [status, setStatus] = useState<VoiceStatus>({ state: "none" });
  useEffect(() => {
    invoke<VoiceStatus>("voice_status").then(setStatus, () => {});
    const unlisten = listen<VoiceStatus>("voice-status", (e) => setStatus(e.payload));
    return () => {
      unlisten.then((stop) => stop(), () => {});
    };
  }, []);
  return status;
}

export function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * Speaks `text` and returns a function that stops it. Speech starts after `delayMs` (so it
 * follows the Push sound). Failures are logged and Coach stays silent.
 */
export function speak(text: string, voice: string, speed: number, volume: number, delayMs = 0): () => void {
  let audio: AudioContext | null = null;
  let stopped = false;
  invoke<ArrayBuffer>("voice_speak", { text, voice, speed })
    .then((buffer) => {
      if (stopped) return;
      const samples = new Float32Array(buffer);
      audio = new AudioContext({ sampleRate: 24_000 });
      const clip = audio.createBuffer(1, samples.length, 24_000);
      clip.copyToChannel(samples, 0);
      const source = audio.createBufferSource();
      const gain = audio.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volume / 100));
      source.buffer = clip;
      source.connect(gain).connect(audio.destination);
      source.start(audio.currentTime + delayMs / 1000);
      source.onended = () => audio?.close();
    })
    .catch((e) => console.error("Coach couldn't speak:", e));
  return () => {
    stopped = true;
    audio?.close().catch(() => {});
  };
}
