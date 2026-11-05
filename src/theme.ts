import { invoke } from "@tauri-apps/api/core";
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

/** Whether a `#rrggbb` colour is dark, by its perceived brightness. */
export function isDarkColor(hex: string): boolean {
  const rgb = Number.parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/**
 * Colours the window's title bar to blend with the top of the window. Fluent leaves it
 * to Windows, so it matches Mica the way Windows' own apps do.
 */
async function colorTitleBar(theme: ThemeId): Promise<void> {
  const styles = getComputedStyle(document.documentElement);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const caption = theme === "fluent" ? null : styles.getPropertyValue("--sidebar").trim();
  const text = theme === "fluent" ? null : styles.getPropertyValue("--text").trim();
  const dark = caption ? isDarkColor(caption) : systemDark;
  await invoke("set_title_bar", { caption, text, dark }).catch(() => {});
}

/**
 * Applies a theme to this window. Fluent in the main window also turns on Windows 11 Mica;
 * on Windows 10, or in the floating window, Fluent stays a solid colour.
 * The floating window has no title bar, so only the main window's is coloured.
 */
export async function applyTheme(theme: ThemeId, isFloat: boolean): Promise<void> {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (!isFloat) await colorTitleBar(theme);
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
