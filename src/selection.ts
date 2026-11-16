/** Keyboard movement, multi-selection and search highlighting over the reminders on screen. */

/** The reminder `delta` rows from `current` in `order`, stopping at the ends. With none current, the first or last. */
export function stepId(order: readonly string[], current: string | null, delta: number): string | null {
  if (order.length === 0) return null;
  const i = current ? order.indexOf(current) : -1;
  if (i < 0) return delta > 0 ? order[0] : order[order.length - 1];
  return order[Math.max(0, Math.min(order.length - 1, i + delta))];
}

/** Every reminder from `from` to `to` in screen order (Shift+click). If `from` is gone, just `to`. */
export function rangeIds(order: readonly string[], from: string, to: string): string[] {
  const b = order.indexOf(to);
  if (b < 0) return [];
  const a = order.indexOf(from);
  if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** Adds `id` to the selection, or takes it out if it is in (Ctrl+click). */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export interface TextPart {
  text: string;
  match: boolean;
}

/** Splits `text` around every case-insensitive match of `query`, to mark search results. */
export function highlightParts(text: string, query: string): TextPart[] {
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  // Lowercasing a few letters changes the length; then positions wouldn't line up.
  if (!q || lower.length !== text.length) return text ? [{ text, match: false }] : [];
  const parts: TextPart[] = [];
  let at = 0;
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, i + q.length)) {
    if (i > at) parts.push({ text: text.slice(at, i), match: false });
    parts.push({ text: text.slice(i, i + q.length), match: true });
    at = i + q.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}
