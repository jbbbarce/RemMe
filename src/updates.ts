import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; percent: number | null }
  | { kind: "error"; message: string };

/**
 * Looks for a newer RemMe on GitHub at startup and every few hours.
 * Nothing installs until `install` is called; it downloads, installs and restarts.
 */
export function useUpdates() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle" });
  const [version, setVersion] = useState("");

  const checkNow = useCallback(async (quiet: boolean) => {
    if (!quiet) setStatus({ kind: "checking" });
    try {
      const update = await check();
      setStatus(update ? { kind: "available", update } : { kind: quiet ? "idle" : "none" });
    } catch (error) {
      // A background check that fails (offline, say) stays quiet; one you asked for says why.
      setStatus(quiet ? { kind: "idle" } : { kind: "error", message: String(error) });
    }
  }, []);

  useEffect(() => {
    getVersion().then(setVersion, () => {});
    checkNow(true);
    const id = window.setInterval(() => checkNow(true), CHECK_EVERY_MS);
    return () => window.clearInterval(id);
  }, [checkNow]);

  const install = useCallback(async () => {
    if (status.kind !== "available") return;
    let total = 0;
    let received = 0;
    setStatus({ kind: "installing", percent: null });
    try {
      await status.update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setStatus({ kind: "installing", percent: total ? Math.round((received / total) * 100) : null });
        }
      });
      await relaunch();
    } catch (error) {
      setStatus({ kind: "error", message: String(error) });
    }
  }, [status]);

  return { status, version, check: () => checkNow(false), install, dismiss: () => setStatus({ kind: "idle" }) };
}
