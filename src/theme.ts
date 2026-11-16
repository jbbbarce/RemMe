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

function luminance(hex: string): number {
  const rgb = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((rgb >> 16) & 0xff) + 0.7152 * channel((rgb >> 8) & 0xff) + 0.0722 * channel(rgb & 0xff);
}

/** WCAG contrast ratio of two `#rrggbb` colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Whether a Windows accent colour can be the app's accent on `background`: links and marks in it
 * must reach 4.5:1 (WCAG AA). Returns it with black or white for text on top of it, or null to
 * keep the theme's own accent.
 */
export function readableAccent(accent: string, background: string): { ui: string; text: string } | null {
  if (!/^#[0-9a-f]{6}$/i.test(accent) || contrast(accent, background) < 4.5) return null;
  return { ui: accent, text: contrast("#ffffff", accent) >= contrast("#000000", accent) ? "#ffffff" : "#000000" };
}

/** Fluent uses the accent colour picked in Windows Settings, when it is readable; other themes keep their own. */
async function applyAccent(theme: ThemeId): Promise<void> {
  const root = document.documentElement;
  root.style.removeProperty("--ui");
  root.style.removeProperty("--ui-text");
  if (theme !== "fluent") return;
  const accent = await invoke<{ light: string; dark: string } | null>("get_accent").catch(() => null);
  if (!accent) return;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const picked = readableAccent(dark ? accent.dark : accent.light, dark ? "#2d2d2d" : "#f3f3f3");
  if (!picked) return;
  root.style.setProperty("--ui", picked.ui);
  root.style.setProperty("--ui-text", picked.text);
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
 * Applies a theme to this window. On Windows 11, Fluent turns on Mica in the main window and
 * Acrylic (a blur of what is behind) in the floating list; on Windows 10 Fluent stays solid.
 * The floating window has no title bar, so only the main window's is coloured.
 */
export async function applyTheme(theme: ThemeId, isFloat: boolean): Promise<void> {
  const root = document.documentElement;
  root.dataset.theme = theme;
  await applyAccent(theme);
  if (!isFloat) await colorTitleBar(theme);
  const window = getCurrentWindow();
  const effect = isFloat ? "acrylic" : "mica";
  if (theme === "fluent" && (await isWindows11())) {
    try {
      await window.setEffects({ effects: [isFloat ? Effect.Acrylic : Effect.Mica] });
      if (isFloat) await invoke("set_round_corners", { round: true });
      root.classList.add(effect);
    } catch {
      root.classList.remove(effect);
    }
    return;
  }
  if (root.classList.contains(effect)) {
    root.classList.remove(effect);
    await window.clearEffects().catch(() => {});
    if (isFloat) await invoke("set_round_corners", { round: false }).catch(() => {});
  }
}
