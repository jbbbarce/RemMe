/** Key events the shortcut recorder reads. */
export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph"]);

const NAMED_CODES: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Minus: "Minus", Equal: "Equal", Comma: "Comma", Period: "Period", Slash: "Slash",
  Semicolon: "Semicolon", Quote: "Quote", BracketLeft: "BracketLeft", BracketRight: "BracketRight",
  Backslash: "Backslash", Backquote: "Backquote",
};

/**
 * Turns a key press into a shortcut such as `Ctrl+Shift+O`.
 * Returns `null` while only modifiers are held, and an error message when the
 * combination cannot be a global shortcut.
 */
export function shortcutFromEvent(e: KeyLike): { shortcut: string } | { error: string } | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code;
  else key = NAMED_CODES[e.code];
  if (!key) return { error: "That key can't be used in a shortcut." };

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");

  const isFunctionKey = key.startsWith("F") && key.length > 1;
  if (!isFunctionKey && !(e.ctrlKey || e.altKey || e.metaKey)) {
    return { error: "Include Ctrl, Alt or Win so typing isn't captured." };
  }
  return { shortcut: [...parts, key].join("+") };
}

export function shortcutParts(shortcut: string): string[] {
  return shortcut.split("+").map((p) => (p === "Super" ? "Win" : p));
}
