import { useCallback, useEffect, useRef, useState } from "react";
import { Dismiss, Undo } from "../icons";
import { deletedMessage, newId, restoreSnapshot, snapshot, undoDelete } from "../model";
import type { AppData } from "../types";

const UNDO_MS = 8000;

interface Offer {
  message: string;
  /** Takes the change back, applied to the data as it is when Undo is pressed. */
  revert(data: AppData): AppData;
}

/** A deletion: changes the data, tagging what it moves to Recently deleted with `batch`. */
export type Deletion = (data: AppData, batch: string) => AppData;

export interface UndoState {
  offer: Offer | null;
  /** Runs a deletion and offers to undo it. `cleared` words the toast for Clear completed. */
  trash(deletion: Deletion, cleared?: boolean): void;
  /**
   * Runs a change to the reminders with `ids` and offers to put them back as they were.
   * `message` reads the data before the change; when it returns null the change gets no toast.
   */
  track(change: (data: AppData) => AppData, ids: readonly string[], message: (before: AppData) => string | null): void;
  /** Offers Undo for a change that was already made. */
  show(message: string, revert: (data: AppData) => AppData): void;
  undo(): void;
  dismiss(): void;
}

function editingText(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * The Undo toast of one window. A deletion, ticking a reminder off, or a quick change (date,
 * list, priority, flag, a drag to another list) shows it for 8 seconds; Undo or Ctrl+Z (outside
 * a text box, where Ctrl+Z still undoes typing) takes it back. Only the latest change is offered.
 */
export function useUndo(update: (change: (d: AppData) => AppData) => void): UndoState {
  const [offer, setOffer] = useState<Offer | null>(null);
  const current = useRef<Offer | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const present = useCallback((next: Offer | null) => {
    window.clearTimeout(timer.current);
    current.current = next;
    setOffer(next);
    if (next) timer.current = window.setTimeout(() => present(null), UNDO_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const trash = useCallback(
    (deletion: Deletion, cleared = false) => {
      const batch = newId();
      let message = null as string | null;
      // `update` applies the change at once, so the message can be read from its result.
      update((d) => {
        const next = deletion(d, batch);
        message = deletedMessage(next, batch, cleared);
        return next;
      });
      if (message) present({ message, revert: (d) => undoDelete(d, batch) });
    },
    [update, present],
  );

  const track = useCallback(
    (change: (data: AppData) => AppData, ids: readonly string[], describe: (before: AppData) => string | null) => {
      let message = null as string | null;
      let snap = snapshot({ tasks: [] } as unknown as AppData, []);
      update((d) => {
        message = describe(d);
        snap = snapshot(d, ids);
        return change(d);
      });
      if (message) present({ message, revert: (d) => restoreSnapshot(d, snap) });
    },
    [update, present],
  );

  const show = useCallback((message: string, revert: (data: AppData) => AppData) => present({ message, revert }), [present]);

  const undo = useCallback(() => {
    const pending = current.current;
    if (!pending) return;
    update((d) => pending.revert(d));
    present(null);
  }, [update, present]);

  const dismiss = useCallback(() => present(null), [present]);

  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z" && !editingText(e.target)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offer, undo]);

  return { offer, trash, track, show, undo, dismiss };
}

export function UndoToast({ state }: { state: UndoState }) {
  if (!state.offer) return null;
  return (
    <div className="toast undo-toast" role="status">
      <span className="undo-message">{state.offer.message}</span>
      <button className="undo-btn" title="Undo (Ctrl+Z)" onClick={state.undo}>
        <Undo size={14} />
        Undo
      </button>
      <button className="icon-btn" aria-label="Dismiss" onClick={state.dismiss}>
        <Dismiss size={13} />
      </button>
    </div>
  );
}
