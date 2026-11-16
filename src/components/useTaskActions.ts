import { useCallback, useEffect, useRef, useState } from "react";
import {
  changeManyMessage,
  changeMessage,
  completedManyMessage,
  completedMessage,
  deleteTask,
  insertTask,
  moveTask,
  newTaskFor,
  setCompleted,
  trashTasks,
  updateTask,
  updateTasks,
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

  /** Ticks reminders off (or back on). Ticking off offers Undo, which also takes back the next one a repeat added. */
  const toggleMany = useCallback(
    (tasks: readonly Task[], completed: boolean) => {
      const ids = tasks.map((t) => t.id);
      let message = null as string | null;
      update((d) => {
        if (completed) message = ids.length === 1 ? completedMessage(d, ids[0]) : completedManyMessage(ids.length);
        return ids.reduce((acc, id) => setCompleted(acc, id, completed, new Date()), d);
      });
      for (const id of ids) window.clearTimeout(timers.current.get(id));
      if (!completed) {
        setLingering((s) => without(s, ...ids));
        return;
      }
      if (message && undo) undo.show(message, (d) => ids.reduce((acc, id) => setCompleted(acc, id, false, new Date()), d));
      // Keep just-finished reminders on screen for a moment, like Apple Reminders.
      setLingering((s) => new Set([...s, ...ids]));
      for (const id of ids) {
        timers.current.set(
          id,
          window.setTimeout(() => {
            timers.current.delete(id);
            setLingering((s) => without(s, id));
          }, LINGER_MS),
        );
      }
    },
    [update, undo],
  );

  const toggle = useCallback((task: Task, completed: boolean) => toggleMany([task], completed), [toggleMany]);

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

  /** A quick change to several selected reminders at once, with one Undo. */
  const quickMany = useCallback(
    (ids: readonly string[], patch: Partial<Task>) => {
      const apply = (d: AppData) => updateTasks(d, ids, patch);
      if (undo) undo.track(apply, ids, (d) => changeManyMessage(d, ids, patch, new Date()));
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

  /** Moves several reminders to Recently deleted, with one Undo. */
  const removeMany = useCallback(
    (ids: readonly string[]) => {
      const deletion = (d: AppData, batch: string) => trashTasks(d, ids, new Date(), batch);
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

  return {
    lingering,
    focusId,
    toggle,
    toggleMany,
    change,
    quick,
    quickMany,
    move,
    add,
    commit,
    remove,
    removeMany,
    removeEmptied,
    isFresh,
  };
}

function without(set: ReadonlySet<string>, ...ids: string[]): ReadonlySet<string> {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
}
