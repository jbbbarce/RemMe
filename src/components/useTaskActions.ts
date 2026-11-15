import { useCallback, useEffect, useRef, useState } from "react";
import { deleteTask, insertTask, newTaskFor, setCompleted, trashTasks, updateTask } from "../model";
import { parseQuickAdd } from "../quickAdd";
import type { AppData, Task, View } from "../types";
import type { UndoState } from "./Undo";

const LINGER_MS = 1200;

/** Task editing shared by the list, board and floating views. */
export function useTaskActions(
  update: (change: (d: AppData) => AppData) => void,
  view: View,
  now: Date,
  trash?: UndoState["trash"],
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
      update((d) => setCompleted(d, task.id, completed, new Date()));
      window.clearTimeout(timers.current.get(task.id));
      if (!completed) {
        setLingering((s) => without(s, task.id));
        return;
      }
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
    [update],
  );

  const change = useCallback(
    (id: string, patch: Partial<Task>) => update((d) => updateTask(d, id, patch)),
    [update],
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
      if (trash) trash(deletion);
      else update((d) => deletion(d, crypto.randomUUID()));
    },
    [update, trash],
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

  return { lingering, focusId, toggle, change, add, commit, remove, removeEmptied };
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}
