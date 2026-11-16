import { Add, LockClosed, LockOpen, Subtract, Window } from "../icons";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SMART_LISTS, floatViewOf, tasksFor, viewColor } from "../model";
import { parseQuickAdd, quickAddSummary } from "../quickAdd";
import { shortcutParts } from "../shortcut";
import { setFloat, useFloatState, useNow } from "../store";
import type { AppData } from "../types";
import { MiniCalendar } from "./MiniCalendar";
import { PomodoroPill } from "./Pomodoro";
import { TaskRow } from "./TaskRow";
import { Dropdown, Tip } from "./ui";
import { UndoToast, useUndo } from "./Undo";
import { useTaskActions } from "./useTaskActions";
import { VersePanel } from "./Verse";

interface Props {
  data: AppData;
  update(change: (d: AppData) => AppData): void;
}

/** The small always-on-top list. Locked, it ignores the mouse entirely. */
export function FloatApp({ data, update }: Props) {
  const now = useNow();
  const { locked } = useFloatState();
  const view = floatViewOf(data);
  const floatViewId = view.kind === "smart" || view.kind === "list" ? view.id : "today";
  const undo = useUndo(update);
  const actions = useTaskActions(update, view, now, undo.trash);
  const tasks = tasksFor(data, view, now, false, actions.lingering);
  const color = viewColor(data, view);
  const [draft, setDraft] = useState("");
  const isCalendar = view.kind === "smart" && view.id === "calendar";
  const canAdd = !(view.kind === "smart" && view.id === "completed") && !isCalendar;

  const draftSummary = draft.trim() ? quickAddSummary(parseQuickAdd(draft, now), now) : [];

  const addFromDraft = () => {
    if (!draft.trim()) return;
    actions.add(undefined, parseQuickAdd(draft, new Date()));
    setDraft("");
  };

  return (
    <div className={`float${locked ? " locked" : ""}`} style={{ "--accent": `var(--c-${color})` } as React.CSSProperties}>
      <header className="float-head" data-tauri-drag-region>
        <Dropdown
          plain
          label="List shown"
          disabled={locked}
          value={floatViewId}
          onChange={(floatView) => update((d) => ({ ...d, settings: { ...d.settings, floatView } }))}
          options={[
            ...SMART_LISTS.map((s) => ({ value: s.id, label: s.name, group: "Smart lists" })),
            ...data.lists.map((l) => ({ value: l.id, label: l.name, group: "My lists" })),
          ]}
        />
        <span className="float-count" data-tauri-drag-region>
          {isCalendar ? "" : tasks.filter((t) => !t.completed).length}
        </span>
        <span className="spacer" data-tauri-drag-region />
        <PomodoroPill data={data} disabled={locked} />
        {locked ? (
          <span className="lock-badge" title="Locked">
            <LockClosed size={12} />
            {shortcutParts(data.settings.lockShortcut).join("+")} to unlock
          </span>
        ) : (
          <>
            <Tip text="Open RemMe">
              <button className="icon-btn" aria-label="Open RemMe" onClick={() => invoke("show_main")}>
                <Window size={16} />
              </button>
            </Tip>
            <Tip text={`Lock: clicks pass through (${data.settings.lockShortcut})`}>
              <button className="icon-btn" aria-label="Lock" onClick={() => setFloat({ locked: true })}>
                <LockOpen size={16} />
              </button>
            </Tip>
            <Tip text={`Hide (${data.settings.toggleShortcut})`}>
              <button className="icon-btn" aria-label="Hide" onClick={() => setFloat({ visible: false })}>
                <Subtract size={16} />
              </button>
            </Tip>
          </>
        )}
      </header>

      {isCalendar ? (
        <MiniCalendar data={data} now={now} actions={actions} />
      ) : (
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
            onEmpty={(before) => actions.removeEmptied(task, before)}
            onCommit={() => actions.commit(task)}
            lists={data.lists}
            onDelete={() => actions.remove(task.id)}
            preview={actions.isFresh(task.id)}
          />
        ))}
      </div>
      )}

      {canAdd && !locked && draftSummary.length > 0 && (
        <div className="qa-preview float-qa" aria-live="polite">
          {draftSummary.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
      {canAdd && !locked && (
        <footer className="float-add">
          <Add size={14} />
          <input
            value={draft}
            placeholder="Add a reminder"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFromDraft()}
          />
        </footer>
      )}

      {data.settings.verseOfDay && <VersePanel now={now} locked={locked} />}
      {!locked && <UndoToast state={undo} />}
    </div>
  );
}
