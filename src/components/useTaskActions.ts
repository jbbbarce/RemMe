import { useCallback, useEffect, useRef, useState } from "react";
import {
  changeMessage,
  completedMessage,
  deleteTask,
  insertTask,
  moveTask,
  newTaskFor,
  setCompleted,
  trashTasks,
  updateTask,
} from "../model";
import { parseQuickAdd } from "../quickAdd";
import type { AppData, Task, View } from "../types";
import type { UndoState } from "./Undo";

const LINGER_MS = 1200;

/** Task editing shared by the list, board and floating views. */
export function useTaskActions(
  update: (change: (d: AppData) => AppData) => void,
  view: View,
  now: Date,
  undo?: UndoState,
) {
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());
  /** Reminders added empty whose typed title hasn't been read for a date yet. */
  const fresh = useRef(new Set<string>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const toggle = useCallback(
    (task: Task, completed: boolean) => {
      let message = null as string | null;
      update((d) => {
        if (completed) message = completedMessage(d, task.id);
        return setCompleted(d, task.id, completed, new Date());
      });
      window.clearTimeout(timers.current.get(task.id));
      if (!completed) {
        setLingering((s) => without(s, task.id));
        return;
      }
      // Unchecking soon after also takes back the next one a repeating reminder added.
      if (message && undo) undo.show(message, (d) => setCompleted(d, task.id, false, new Date()));
      // Keep a just-finished reminder on screen for a moment, like Apple Reminders.
      setLingering((s) => new Set(s).add(task.id));
      timers.current.set(
        task.id,
        window.setTimeout(() => {
          timers.current.delete(task.id);
          setLingering((s) => without(s, task.id));
        }, LINGER_MS),
      );
    },
    [update, undo],
  );

  const change = useCallback(
    (id: string, patch: Partial<Task>) => update((d) => updateTask(d, id, patch)),
    [update],
  );

  /**
   * A change made from a reminder's menu, its date or priority button, or a drag to another list
   * or column. Unlike typing in the details panel, it offers Undo.
   */
  const quick = useCallback(
    (id: string, patch: Partial<Task>) => {
      const apply = (d: AppData) => updateTask(d, id, patch);
      if (undo) undo.track(apply, [id], (d) => changeMessage(d, id, patch, new Date()));
      else update(apply);
    },
    [update, undo],
  );

  /** A drag that drops a reminder before or after another. Moving it to another list or section offers Undo. */
  const move = useCallback(
    (id: string, targetId: string, after: boolean) => {
      const apply = (d: AppData) => moveTask(d, id, targetId, after);
      if (!undo) return update(apply);
      undo.track(apply, [id], (d) => {
        const target = d.tasks.find((t) => t.id === targetId);
        return target ? changeMessage(d, id, { listId: target.listId, section: target.section }, new Date()) : null;
      });
    },
    [update, undo],
  );

  /** Adds an empty reminder (after `afterId` if given) and focuses its title. */
  const add = useCallback(
    (afterId?: string, overrides: Partial<Task> = {}) => {
      let id = "";
      update((d) => {
        const task = { ...newTaskFor(d, view, now), ...overrides };
        id = task.id;
        return insertTask(d, task, afterId);
      });
      if (!overrides.title) fresh.current.add(id);
      setFocusId(id);
    },
    [update, view, now],
  );

  /** A new reminder's title was finished: "Call mom tomorrow 5pm" sets its date and time. */
  const commit = useCallback(
    (task: Task) => {
      if (!fresh.current.delete(task.id)) return;
      const parsed = parseQuickAdd(task.title, new Date());
      if (parsed.title !== task.title) update((d) => updateTask(d, task.id, parsed));
    },
    [update],
  );

  /** Moves a reminder to Recently deleted and offers Undo. */
  const remove = useCallback(
    (id: string, patch: Partial<Task> = {}) => {
      const deletion = (d: AppData, batch: string) => trashTasks(d, [id], new Date(), batch, patch);
      if (undo) undo.trash(deletion);
      else update((d) => deletion(d, crypto.randomUUID()));
    },
    [update, undo],
  );

  /**
   * A reminder's title was left empty. `titleBefore` is what it said before: one that never had a
   * title, notes or subtasks is just dropped; otherwise it goes to Recently deleted with that title.
   */
  const removeEmptied = useCallback(
    (task: Task, titleBefore: string) => {
      fresh.current.delete(task.id);
      if (!titleBefore.trim() && !task.notes.trim() && task.subtasks.length === 0) {
        update((d) => deleteTask(d, task.id));
      } else {
        remove(task.id, { title: titleBefore });
      }
    },
    [update, remove],
  );

  /** Whether a reminder was added empty and its title hasn't been read for a date yet. */
  const isFresh = useCallback((id: string) => fresh.current.has(id), []);

  return { lingering, focusId, toggle, change, quick, move, add, commit, remove, removeEmptied, isFresh };
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}
