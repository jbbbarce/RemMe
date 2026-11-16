import { Dismiss, Undo } from "../icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { deletedMessage, newId, undoDelete } from "../model";
import type { AppData } from "../types";

const UNDO_MS = 8000;

interface Offer {
  batch: string;
  message: string;
}

/** A deletion: changes the data, tagging what it moves to Recently deleted with `batch`. */
export type Deletion = (data: AppData, batch: string) => AppData;

export interface UndoState {
  offer: Offer | null;
  /** Runs a deletion and offers to undo it. `cleared` words the toast for Clear completed. */
  trash(deletion: Deletion, cleared?: boolean): void;
  undo(): void;
  dismiss(): void;
}

function editingText(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * The Undo toast of one window. A deletion shows it for 8 seconds; Undo or Ctrl+Z (outside a
 * text box, where Ctrl+Z still undoes typing) puts everything back where it was.
 */
export function useUndo(update: (change: (d: AppData) => AppData) => void): UndoState {
  const [offer, setOffer] = useState<Offer | null>(null);
  const current = useRef<Offer | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((next: Offer | null) => {
    window.clearTimeout(timer.current);
    current.current = next;
    setOffer(next);
    if (next) timer.current = window.setTimeout(() => show(null), UNDO_MS);
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
      if (message) show({ batch, message });
    },
    [update, show],
  );

  const undo = useCallback(() => {
    const pending = current.current;
    if (!pending) return;
    update((d) => undoDelete(d, pending.batch));
    show(null);
  }, [update, show]);

  const dismiss = useCallback(() => show(null), [show]);

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

  return { offer, trash, undo, dismiss };
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
