import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppWindow, Lock, LockOpen, Minus, Plus } from "lucide-react";
import { SMART_LISTS, floatViewOf, tasksFor, viewColor } from "../model";
import { shortcutParts } from "../shortcut";
import { setFloat, useFloatState, useNow } from "../store";
import type { AppData } from "../types";
import { TaskRow } from "./TaskRow";
import { useTaskActions } from "./useTaskActions";

interface Props {
  data: AppData;
  update(change: (d: AppData) => AppData): void;
}

/** The small always-on-top list. Locked, it ignores the mouse entirely. */
export function FloatApp({ data, update }: Props) {
  const now = useNow();
  const { locked } = useFloatState();
  const view = floatViewOf(data);
  const actions = useTaskActions(update, view, now);
  const tasks = tasksFor(data, view, now, false, actions.lingering);
  const color = viewColor(data, view);
  const [draft, setDraft] = useState("");
  const canAdd = !(view.kind === "smart" && view.id === "completed");

  const addFromDraft = () => {
    const title = draft.trim();
    if (!title) return;
    actions.add(undefined, { title });
    setDraft("");
  };

  return (
    <div className={`float${locked ? " locked" : ""}`} style={{ "--accent": `var(--c-${color})` } as React.CSSProperties}>
      <header className="float-head" data-tauri-drag-region>
        <select
          className="float-view"
          value={data.settings.floatView}
          onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, floatView: e.target.value } }))}
        >
          <optgroup label="Smart Lists">
            {SMART_LISTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="My Lists">
            {data.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="float-count" data-tauri-drag-region>
          {tasks.filter((t) => !t.completed).length}
        </span>
        <span className="spacer" data-tauri-drag-region />
        {locked ? (
          <span className="lock-badge" title="Locked">
            <Lock size={12} />
            {shortcutParts(data.settings.lockShortcut).join("+")} to unlock
          </span>
        ) : (
          <>
            <button className="icon-btn" title="Open Reminders" onClick={() => invoke("show_main")}>
              <AppWindow size={14} />
            </button>
            <button
              className="icon-btn"
              title={`Lock (${data.settings.lockShortcut})`}
              onClick={() => setFloat({ locked: true })}
            >
              <LockOpen size={14} />
            </button>
            <button
              className="icon-btn"
              title={`Hide (${data.settings.toggleShortcut})`}
              onClick={() => setFloat({ visible: false })}
            >
              <Minus size={14} />
            </button>
          </>
        )}
      </header>

      <div className="float-body">
        {tasks.length === 0 && <p className="empty">All done 🎉</p>}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            list={data.lists.find((l) => l.id === task.listId)}
            now={now}
            compact
            autoFocus={task.id === actions.focusId && !task.title}
            onToggle={(done) => actions.toggle(task, done)}
            onChange={(patch) => actions.change(task.id, patch)}
            onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
            onEmpty={() => actions.remove(task.id)}
          />
        ))}
      </div>

      {canAdd && !locked && (
        <footer className="float-add">
          <Plus size={14} />
          <input
            value={draft}
            placeholder="Add a reminder"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFromDraft()}
          />
        </footer>
      )}
    </div>
  );
}
