import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import type { ThemeId } from "./types";

export const THEME_NAMES: Record<ThemeId, string> = {
  pro: "Sharp dark pro",
  calm: "Calm minimal",
  paper: "Paper and ink",
  fluent: "Windows Fluent",
};

/** Windows 11 reports platform version 13 or higher; Windows 10 reports less. */
async function isWindows11(): Promise<boolean> {
  const uaData = (navigator as Navigator & {
    userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ platformVersion?: string }> };
  }).userAgentData;
  if (!uaData) return false;
  const { platformVersion } = await uaData.getHighEntropyValues(["platformVersion"]);
  return Number(platformVersion?.split(".")[0] ?? 0) >= 13;
}

/**
 * Applies a theme to this window. Fluent in the main window also turns on Windows 11 Mica;
 * on Windows 10, or in the floating window, Fluent stays a solid colour.
 */
export async function applyTheme(theme: ThemeId, isFloat: boolean): Promise<void> {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const window = getCurrentWindow();
  if (theme === "fluent" && !isFloat && (await isWindows11())) {
    try {
      await window.setEffects({ effects: [Effect.Mica] });
      root.classList.add("mica");
    } catch {
      root.classList.remove("mica");
    }
    return;
  }
  if (root.classList.contains("mica")) {
    root.classList.remove("mica");
    await window.clearEffects().catch(() => {});
  }
}
