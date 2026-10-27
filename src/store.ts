import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { normalize } from "./model";
import type { AppData, FloatState } from "./types";

const SAVE_DELAY_MS = 250;

/**
 * Loads the shared task data and keeps it in sync with the other window.
 * `update` applies a change at once and saves it shortly after.
 */
export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dataRef = useRef<AppData | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (!dataRef.current) return;
    invoke("save_data", { data: dataRef.current }).then(
      () => setSaveError(null),
      (error) => setSaveError(String(error)),
    );
  }, []);

  useEffect(() => {
    const label = getCurrentWindow().label;
    invoke<AppData>("load_data").then((loaded) => {
      dataRef.current = normalize(loaded);
      setData(dataRef.current);
    });
    const unlisten = listen<{ source: string; data: AppData }>("data-changed", (event) => {
      // Our own saves echo back; a pending local edit wins over a remote one.
      if (event.payload.source === label || timer.current !== undefined) return;
      dataRef.current = normalize(event.payload.data);
      setData(dataRef.current);
    });
    window.addEventListener("beforeunload", flush);
    return () => {
      unlisten.then((stop) => stop());
      window.removeEventListener("beforeunload", flush);
    };
  }, [flush]);

  const update = useCallback(
    (change: (current: AppData) => AppData) => {
      if (!dataRef.current) return;
      dataRef.current = change(dataRef.current);
      setData(dataRef.current);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  return { data, update, saveError };
}

export function useFloatState(): FloatState {
  const [state, setState] = useState<FloatState>({ visible: false, locked: false });
  useEffect(() => {
    invoke<FloatState>("get_float_state").then(setState);
    const unlisten = listen<FloatState>("float-state", (event) => setState(event.payload));
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);
  return state;
}

export function setFloat(change: Partial<FloatState>): Promise<void> {
  return invoke("set_float", change);
}

/** Re-renders every minute so "Today" and overdue colors stay current. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
