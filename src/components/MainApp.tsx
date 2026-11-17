import { Add, Board, Checkmark, ChevronDown, Delete, Dismiss, Flag, FloatingList, ListLayout, LockClosed, LockOpen, More, Settings as SettingsIcon, SidebarCollapse, SidebarExpand } from "../icons";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DAY_PRESETS, DAY_PRESET_LABELS, NO_DUE, dueOnDay, isOverdue, presetDay } from "../dates";
import { PRIORITY_NAMES } from "../quickAdd";
import { rangeIds, stepId, toggleId } from "../selection";
import {
  clearCompleted,
  deleteList,
  newId,
  purgeDeleted,
  setCompleted,
  smartCount,
  tasksFor,
  updateTask,
  upsertList,
  viewTitle,
} from "../model";
import { playChime } from "../pomodoro";
import { setFloat, useFloatState, useNow } from "../store";
import { useUpdates } from "../updates";
import type { AppData, PopupAction, Priority, ReminderList, Task, TimerFinished, View } from "../types";
import { ListDialog, SettingsDialog } from "./Dialogs";
import { UpdateBar } from "./UpdateBar";
import { RecoveryBanner } from "./Backups";
import { Inspector, Switch } from "./Inspector";
import { Menu, Tip } from "./ui";
import { Sidebar } from "./Sidebar";
import { CalendarView } from "./CalendarView";
import { BoardView, ListView } from "./TaskViews";
import { RecentlyDeleted } from "./RecentlyDeleted";
import { UndoToast, useUndo } from "./Undo";
import { useTaskActions } from "./useTaskActions";

const VIEW_KEY = "remme.view";
const LAYOUT_KEY = "remme.layout";
const SIDEBAR_KEY = "remme.sidebar";
/** Below this window width the sidebar becomes an icon rail by itself. */
const NARROW = "(max-width: 899px)";

/** Whether a media query matches, kept up to date. */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The reminders in the list or board, in the order they are on screen. */
function screenOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".view-body [data-task-id]")].map((el) => el.dataset.taskId!);
}

function rowElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.view-body [data-task-id="${CSS.escape(id)}"]`);
}

/** Puts keyboard focus on a reminder's row, scrolling it into view. */
function focusRow(id: string) {
  window.requestAnimationFrame(() => {
    const row = rowElement(id);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  });
}

/** Keys typed into these go to them, not to the list. */
function isControl(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("button, a, input, textarea, select, [contenteditable], [role='switch'], [role='menu'], [role='dialog']");
}

interface Selection {
  ids: string[];
  /** Where a Shift+click or Shift+arrow range starts. */
  anchor: string | null;
  /** The row the arrow keys move from. */
  cursor: string | null;
}

const NO_SELECTION: Selection = { ids: [], anchor: null, cursor: null };

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering the last view is a convenience only.
  }
}

interface Props {
  data: AppData;
  update(change: (d: AppData) => AppData): void;
  saveError: string | null;
}

export function MainApp({ data, update, saveError }: Props) {
  const now = useNow();
  const float = useFloatState();
  const [baseView, setBaseView] = useState<View>(() => readLocal<View>(VIEW_KEY, { kind: "smart", id: "today" }));
  const [layout, setLayout] = useState<"list" | "board">(() => readLocal(LAYOUT_KEY, "list"));
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<{ list: ReminderList; isNew: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The sidebar follows the window's width until it is toggled; crossing the width starts over.
  const narrow = useMedia(NARROW);
  const [railChoice, setRailChoice] = useState<boolean | null>(() => readLocal<boolean | null>(SIDEBAR_KEY, null));
  const rail = railChoice ?? narrow;
  const firstWidth = useRef(true);
  useEffect(() => {
    if (firstWidth.current) {
      firstWidth.current = false;
      return;
    }
    setRailChoice(null);
  }, [narrow]);
  useEffect(() => writeLocal(SIDEBAR_KEY, railChoice), [railChoice]);

  // A list that was deleted (here or in the floating window) falls back to Today.
  const validView: View =
    baseView.kind === "list" && !data.lists.some((l) => l.id === baseView.id)
      ? { kind: "smart", id: "today" }
      : baseView;
  const view: View = search.trim() ? { kind: "search", query: search } : validView;
  const undo = useUndo(update);
  const actions = useTaskActions(update, view, now, undo);
  const tasks = tasksFor(data, view, now, showCompleted, actions.lingering);
  const inspected = data.tasks.find((t) => t.id === inspectId);
  // Reminders that left the view (done, deleted, moved) drop out of the selection.
  const shownIds = new Set(tasks.map((t) => t.id));
  const selectedIds = selection.ids.filter((id) => shownIds.has(id));
  const selectedTasks = tasks.filter((t) => selectedIds.includes(t.id));

  const select = (id: string, mode?: "toggle" | "range") =>
    setSelection((s) => {
      if (mode === "toggle") return { ids: toggleId(s.ids, id), anchor: id, cursor: id };
      if (mode === "range") return { ids: rangeIds(screenOrder(), s.anchor ?? id, id), anchor: s.anchor ?? id, cursor: id };
      return { ids: [id], anchor: id, cursor: id };
    });
  const clearSelection = () => setSelection(NO_SELECTION);

  /** Space, or Complete in the selection bar: ticks off the selected reminders, or back on if all are done. */
  const toggleSelected = () => {
    if (selectedTasks.length === 0) return;
    const allDone = selectedTasks.every((t) => t.completed && !actions.lingering.has(t.id));
    actions.toggleMany(allDone ? selectedTasks : selectedTasks.filter((t) => !t.completed), !allDone);
  };

  /** Delete: the selected reminders go to Recently deleted and the next row is selected. */
  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const order = screenOrder();
    const rest = order.filter((id) => !selectedIds.includes(id));
    const from = order.indexOf(selection.cursor ?? selectedIds[0]);
    const next = order.slice(from + 1).find((id) => rest.includes(id)) ?? rest.filter((id) => order.indexOf(id) < from).at(-1);
    actions.removeMany(selectedIds);
    if (next) {
      select(next);
      focusRow(next);
    } else clearSelection();
  };
  const openCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasksFor(data, view, now, true).filter((t) => t.completed).length;
  const isCompletedView = view.kind === "smart" && view.id === "completed";
  const isCalendar = view.kind === "smart" && view.id === "calendar";
  const isDeleted = view.kind === "deleted";
  const canAdd = view.kind !== "search" && !isCompletedView && !isCalendar && !isDeleted;

  // Recently deleted forgets things after 30 days. Only the main window does this, once a minute.
  const expired = purgeDeleted(data, now) !== data;
  useEffect(() => {
    if (expired) update((d) => purgeDeleted(d, new Date()));
  }, [expired, update]);

  // Only the main window records finished sessions and chimes, so nothing happens twice.
  const updates = useUpdates();
  const chime = data.settings.pomodoroChime;
  useEffect(() => {
    const unlisten = listen<TimerFinished>("pomodoro-done", ({ payload }) => {
      if (chime) playChime();
      const id = payload.taskId;
      if (payload.counted && id) {
        update((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === id ? { ...t, pomodoros: t.pomodoros + 1 } : t)),
        }));
      }
    });
    return () => {
      unlisten.then((stop) => stop(), () => {});
    };
  }, [chime, update]);

  // Buttons and clicks on reminder popups arrive here, so Done works exactly like ticking off.
  useEffect(() => {
    const unlisten = listen<PopupAction>("popup-action", ({ payload }) => {
      const { action, taskId, minutes } = payload;
      if (action === "today") {
        setSearch("");
        setBaseView({ kind: "smart", id: "today" });
        return;
      }
      if (!taskId) return;
      if (action === "snooze" && minutes) {
        const until = new Date(Date.now() + minutes * 60_000).toISOString();
        update((d) => updateTask(d, taskId, { snoozedUntil: until }));
      } else if (action === "done") {
        update((d) => {
          const task = d.tasks.find((t) => t.id === taskId);
          return task && !task.completed ? setCompleted(d, taskId, true, new Date()) : d;
        });
      } else if (action === "open") {
        const task = data.tasks.find((t) => t.id === taskId);
        if (!task) return;
        setSearch("");
        setBaseView({ kind: "list", id: task.listId });
        setSelection({ ids: [taskId], anchor: taskId, cursor: taskId });
        setInspectId(taskId);
      }
    });
    return () => {
      unlisten.then((stop) => stop(), () => {});
    };
  }, [data.tasks, update]);

  // The tray icon's tooltip says what is due today.
  const dueToday = smartCount(data, "today", now);
  const overdue = data.tasks.filter((t) => isOverdue(t, now)).length;
  useEffect(() => {
    invoke("set_tray_status", { dueToday, overdue }).catch(() => {});
  }, [dueToday, overdue]);

  // "Add reminder…" in the tray menu: a new reminder in this list, or in Today if this view can't take one.
  const [pendingAdd, setPendingAdd] = useState(false);
  useEffect(() => {
    const unlisten = listen("new-reminder", () => {
      setSearch("");
      setPendingAdd(true);
    });
    return () => {
      unlisten.then((stop) => stop(), () => {});
    };
  }, []);
  useEffect(() => {
    if (!pendingAdd) return;
    if (!canAdd) {
      setBaseView({ kind: "smart", id: "today" });
      return;
    }
    setPendingAdd(false);
    actions.add();
  }, [pendingAdd, canAdd, actions]);

  useEffect(() => writeLocal(VIEW_KEY, baseView), [baseView]);
  useEffect(() => writeLocal(LAYOUT_KEY, layout), [layout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n" && canAdd) {
        e.preventDefault();
        actions.add();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, canAdd]);

  // Moving through the list from the keyboard. Keys typed into a text box or a button stay there.
  useEffect(() => {
    if (isCalendar || isDeleted) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.defaultPrevented || e.altKey || isControl(target)) return;
      if (target !== document.body && !target.closest?.(".view-body")) return;
      if (document.querySelector("[role='dialog'], [role='menu']")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const order = screenOrder();
      const cursor = selection.cursor && order.includes(selection.cursor) ? selection.cursor : null;
      const go = (id: string | null | undefined) => {
        if (!id) return;
        e.preventDefault();
        if (e.shiftKey) select(id, "range");
        else select(id);
        focusRow(id);
      };
      if (e.key === "ArrowDown" && !ctrl) go(stepId(order, cursor, 1));
      else if (e.key === "ArrowUp" && !ctrl) go(stepId(order, cursor, -1));
      else if (e.key === "Home" && !ctrl) go(order[0]);
      else if (e.key === "End" && !ctrl) go(order.at(-1));
      else if (ctrl && !e.shiftKey && e.key.toLowerCase() === "a" && order.length) {
        e.preventDefault();
        setSelection({ ids: order, anchor: order[0], cursor: cursor ?? order[0] });
      } else if (!cursor) {
        return;
      } else if ((e.key === "Enter" || e.key === "F2") && !ctrl && !e.shiftKey) {
        e.preventDefault();
        const title = rowElement(cursor)?.querySelector("textarea");
        title?.focus();
        title?.setSelectionRange(title.value.length, title.value.length);
      } else if (e.key === " " && !ctrl) {
        e.preventDefault();
        toggleSelected();
      } else if (e.key === "Delete" && !ctrl) {
        e.preventDefault();
        deleteSelected();
      } else if (ctrl && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setInspectId(cursor);
      } else if (e.key === "Escape" && selectedIds.length > 0) {
        e.preventDefault();
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selectView = (next: View) => {
    setSearch("");
    setBaseView(next);
    clearSelection();
  };

  const allFlagged = selectedTasks.length > 0 && selectedTasks.every((t) => t.flagged);
  const bulk = (patch: Partial<Task>) => actions.quickMany(selectedIds, patch);

  const viewProps = {
    data,
    view,
    tasks,
    now,
    actions,
    selectedIds,
    hiddenDone: showCompleted || view.kind === "smart" ? 0 : completedCount,
    onSelect: select,
    onInfo: (id: string) => {
      select(id);
      setInspectId(id);
    },
    update,
  };

  return (
    <div className="app">
      <Sidebar
        data={data}
        view={view}
        now={now}
        search={search}
        onSearch={setSearch}
        onView={selectView}
        onAddList={() =>
          setEditingList({
            list: { id: newId(), name: "", color: "blue", icon: "list", sections: [] },
            isNew: true,
          })
        }
        onEditList={(list) => setEditingList({ list, isNew: false })}
        onDropTask={(listId, id) => actions.quick(id, { listId, section: null })}
        rail={rail}
        onOpenSearch={() => {
          setRailChoice(false);
          window.setTimeout(() => document.querySelector<HTMLInputElement>(".sidebar .search input")?.focus(), 0);
        }}
      />

      <main className="content">
        <div className="toolbar">
          <Tip text={rail ? "Show sidebar" : "Hide sidebar"}>
            <button
              className="icon-btn big"
              aria-label={rail ? "Show sidebar" : "Hide sidebar"}
              aria-expanded={!rail}
              onClick={() => setRailChoice(!rail)}
            >
              {rail ? <SidebarExpand size={20} /> : <SidebarCollapse size={20} />}
            </button>
          </Tip>
          {!isCalendar && !isDeleted && (
          <div className="segmented" role="tablist" aria-label="Layout">
            <button
              className={layout === "list" ? "on" : ""}
              aria-label="List layout"
              title="List"
              onClick={() => setLayout("list")}
            >
              <ListLayout size={16} />
              List
            </button>
            <button
              className={layout === "board" ? "on" : ""}
              aria-label="Board layout"
              title="Board"
              onClick={() => setLayout("board")}
            >
              <Board size={16} />
              Board
            </button>
          </div>
          )}
          <span className="spacer" />
          <button
            className={`tool${float.visible ? " on" : ""}`}
            title={`Floating list (${data.settings.toggleShortcut})`}
            onClick={() => setFloat({ visible: !float.visible })}
          >
            <FloatingList size={16} />
            Floating list
          </button>
          <button
            className={`tool${float.locked ? " on" : ""}`}
            title={`Lock floating list (${data.settings.lockShortcut})`}
            onClick={() => setFloat({ locked: !float.locked })}
          >
            {float.locked ? <LockClosed size={16} /> : <LockOpen size={16} />}
            {float.locked ? "Locked" : "Lock"}
          </button>
          <Tip text="Settings">
            <button className="icon-btn big" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={20} />
            </button>
          </Tip>
          {canAdd && (
            <Tip text="New reminder (Ctrl+N)">
              <button className="btn primary" onClick={() => actions.add()}>
                <Add size={16} />
                New reminder
              </button>
            </Tip>
          )}
        </div>

        {isDeleted ? (
          <RecentlyDeleted data={data} now={now} update={update} />
        ) : isCalendar ? (
          <CalendarView data={data} now={now} actions={actions} update={update} onInfo={viewProps.onInfo} />
        ) : (
          <>
        <header className="view-head">
          <h1>{viewTitle(data, view)}</h1>
          {selectedIds.length > 1 ? (
            <div className="bulk-bar" role="toolbar" aria-label="Selected reminders">
              <span className="bulk-count">{selectedIds.length} selected</span>
              <button className="tool" title="Complete (Space)" onClick={toggleSelected}>
                <Checkmark size={16} />
                {selectedTasks.every((t) => t.completed) ? "Not done" : "Complete"}
              </button>
              <Menu
                trigger={
                  <button className="tool">
                    Date
                    <ChevronDown size={12} />
                  </button>
                }
                items={[
                  ...DAY_PRESETS.map((p) => ({
                    label: DAY_PRESET_LABELS[p],
                    onSelect: () => bulk(dueOnDay({ dueAt: null, dueHasTime: false }, presetDay(p, new Date()))),
                  })),
                  { label: "No date", separated: true, onSelect: () => bulk(NO_DUE) },
                ]}
              />
              <Menu
                trigger={
                  <button className="tool">
                    Priority
                    <ChevronDown size={12} />
                  </button>
                }
                items={([3, 2, 1, 0] as Priority[]).map((p) => ({
                  label: PRIORITY_NAMES[p] || "None",
                  onSelect: () => bulk({ priority: p }),
                }))}
              />
              {data.lists.length > 1 && (
                <Menu
                  trigger={
                    <button className="tool">
                      Move to
                      <ChevronDown size={12} />
                    </button>
                  }
                  items={data.lists.map((l) => ({
                    label: l.name,
                    icon: <span className="menu-dot" style={{ background: `var(--c-${l.color})` }} />,
                    onSelect: () => bulk({ listId: l.id, section: null }),
                  }))}
                />
              )}
              <button className="tool" onClick={() => bulk({ flagged: !allFlagged })}>
                <Flag size={16} />
                {allFlagged ? "Unflag" : "Flag"}
              </button>
              <button className="tool danger-text" title="Delete (Del)" onClick={deleteSelected}>
                <Delete size={16} />
                Delete
              </button>
              <Tip text="Clear selection (Esc)">
                <button className="icon-btn" aria-label="Clear selection" onClick={clearSelection}>
                  <Dismiss size={14} />
                </button>
              </Tip>
            </div>
          ) : (
          <div className="view-sub">
            {isCompletedView ? (
              <span>{completedCount} done</span>
            ) : (
              <>
                <span>{openCount} open</span>
                <span>{completedCount} done</span>
                {view.kind !== "smart" && (
                  <label className="with-switch">
                    <Switch checked={showCompleted} onChange={setShowCompleted} />
                    Show done
                  </label>
                )}
                {completedCount > 0 && (
                  <Menu
                    trigger={
                      <button className="icon-btn" aria-label="More">
                        <More size={16} />
                      </button>
                    }
                    items={[
                      {
                        label: `Clear ${completedCount} completed`,
                        icon: <Delete size={16} />,
                        onSelect: () => undo.trash((d, batch) => clearCompleted(d, view, new Date(), batch), true),
                      },
                    ]}
                  />
                )}
              </>
            )}
          </div>
          )}
        </header>

        <div className={`view-body ${layout}`} onClick={(e) => e.target === e.currentTarget && clearSelection()}>
          {layout === "list" ? <ListView {...viewProps} /> : <BoardView {...viewProps} />}
        </div>
          </>
        )}
        <RecoveryBanner />
        <UndoToast state={undo} />
        <UpdateBar updates={updates} />
        {saveError && <div className="toast error">{saveError}</div>}
      </main>

      {inspected && (
        <Inspector
          data={data}
          task={inspected}
          now={now}
          onChange={(patch) => actions.change(inspected.id, patch)}
          onQuickChange={(patch) => actions.quick(inspected.id, patch)}
          onToggle={(done) => actions.toggle(inspected, done)}
          onDelete={() => {
            actions.remove(inspected.id);
            setInspectId(null);
          }}
          onClose={() => setInspectId(null)}
        />
      )}

      {editingList && (
        <ListDialog
          list={editingList.list}
          isNew={editingList.isNew}
          canDelete={data.lists.length > 1}
          taskCount={data.tasks.filter((t) => t.listId === editingList.list.id).length}
          onSave={(list) => {
            update((d) => upsertList(d, list));
            if (editingList.isNew) selectView({ kind: "list", id: list.id });
            setEditingList(null);
          }}
          onDelete={() => {
            const id = editingList.list.id;
            undo.trash((d, batch) => deleteList(d, id, new Date(), batch));
            setEditingList(null);
          }}
          onClose={() => setEditingList(null)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          data={data}
          onShortcuts={(toggleShortcut, lockShortcut, pomodoroShortcut) =>
            update((d) => ({ ...d, settings: { ...d.settings, toggleShortcut, lockShortcut, pomodoroShortcut } }))
          }
          onSettings={(patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }))}
          onTheme={(theme) => update((d) => ({ ...d, settings: { ...d.settings, theme } }))}
          updates={updates}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
