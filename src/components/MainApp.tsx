import { Add, Board, Delete, FloatingList, ListLayout, LockClosed, LockOpen, More, Settings as SettingsIcon, SidebarCollapse, SidebarExpand } from "../icons";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isOverdue } from "../dates";
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
import type { AppData, PopupAction, ReminderList, TimerFinished, View } from "../types";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        setSelectedId(taskId);
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

  const selectView = (next: View) => {
    setSearch("");
    setBaseView(next);
    setSelectedId(null);
  };

  const viewProps = {
    data,
    view,
    tasks,
    now,
    actions,
    selectedId,
    onSelect: setSelectedId,
    onInfo: (id: string) => {
      setSelectedId(id);
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
        </header>

        <div className={`view-body ${layout}`} onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}>
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
