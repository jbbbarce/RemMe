import { useCallback, useEffect, useRef, useState } from "react";
import { deleteTask, insertTask, newTaskFor, setCompleted, updateTask } from "../model";
import type { AppData, Task, View } from "../types";

const LINGER_MS = 1200;

/** Task editing shared by the list, board and floating views. */
export function useTaskActions(update: (change: (d: AppData) => AppData) => void, view: View, now: Date) {
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());

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
      setFocusId(id);
    },
    [update, view, now],
  );

  const remove = useCallback((id: string) => update((d) => deleteTask(d, id)), [update]);

  return { lingering, focusId, toggle, change, add, remove };
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}
