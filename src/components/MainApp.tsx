import { useEffect, useState } from "react";
import { Columns3, LayoutList, Lock, LockOpen, PanelTopOpen, Plus, Settings as SettingsIcon } from "lucide-react";
import {
  clearCompleted,
  deleteList,
  newId,
  tasksFor,
  upsertList,
  viewColor,
  viewTitle,
} from "../model";
import { setFloat, useFloatState, useNow } from "../store";
import type { AppData, ReminderList, View } from "../types";
import { ListDialog, SettingsDialog } from "./Dialogs";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { BoardView, ListView } from "./TaskViews";
import { useTaskActions } from "./useTaskActions";

const VIEW_KEY = "reminders.view";
const LAYOUT_KEY = "reminders.layout";

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

  // A list that was deleted (here or in the floating window) falls back to Today.
  const validView: View =
    baseView.kind === "list" && !data.lists.some((l) => l.id === baseView.id)
      ? { kind: "smart", id: "today" }
      : baseView;
  const view: View = search.trim() ? { kind: "search", query: search } : validView;
  const actions = useTaskActions(update, view, now);
  const tasks = tasksFor(data, view, now, showCompleted, actions.lingering);
  const inspected = data.tasks.find((t) => t.id === inspectId);
  const openCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasksFor(data, view, now, true).filter((t) => t.completed).length;
  const isCompletedView = view.kind === "smart" && view.id === "completed";
  const canAdd = view.kind !== "search" && !isCompletedView;

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
      />

      <main className="content">
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Layout">
            <button
              className={layout === "list" ? "on" : ""}
              aria-label="List layout"
              title="List"
              onClick={() => setLayout("list")}
            >
              <LayoutList size={16} />
            </button>
            <button
              className={layout === "board" ? "on" : ""}
              aria-label="Board layout"
              title="Board"
              onClick={() => setLayout("board")}
            >
              <Columns3 size={16} />
            </button>
          </div>
          <span className="spacer" />
          <button
            className={`tool${float.visible ? " on" : ""}`}
            title={`Floating list (${data.settings.toggleShortcut})`}
            onClick={() => setFloat({ visible: !float.visible })}
          >
            <PanelTopOpen size={17} />
            Float
          </button>
          <button
            className={`tool${float.locked ? " on" : ""}`}
            title={`Lock floating list (${data.settings.lockShortcut})`}
            onClick={() => setFloat({ locked: !float.locked })}
          >
            {float.locked ? <Lock size={16} /> : <LockOpen size={16} />}
            {float.locked ? "Locked" : "Lock"}
          </button>
          {canAdd && (
            <button className="icon-btn big" aria-label="New reminder (Ctrl+N)" title="New reminder (Ctrl+N)" onClick={() => actions.add()}>
              <Plus size={20} />
            </button>
          )}
          <button className="icon-btn big" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon size={18} />
          </button>
        </div>

        <header className="view-head">
          <h1 style={{ color: `var(--c-${viewColor(data, view)})` }}>{viewTitle(data, view)}</h1>
          <span className="view-count" style={{ color: `var(--c-${viewColor(data, view)})` }}>
            {isCompletedView ? completedCount : openCount}
          </span>
        </header>
        {!isCompletedView && (
          <div className="completed-line">
            <span>{completedCount} Completed</span>
            {completedCount > 0 && (
              <>
                <span className="dot">•</span>
                <button className="link" onClick={() => update((d) => clearCompleted(d, view, now))}>
                  Clear
                </button>
              </>
            )}
            {view.kind !== "smart" && (
              <button className="link right" onClick={() => setShowCompleted(!showCompleted)}>
                {showCompleted ? "Hide" : "Show"}
              </button>
            )}
          </div>
        )}

        <div className={`view-body ${layout}`} onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}>
          {layout === "list" ? <ListView {...viewProps} /> : <BoardView {...viewProps} />}
        </div>
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
            update((d) => deleteList(d, editingList.list.id));
            setEditingList(null);
          }}
          onClose={() => setEditingList(null)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          data={data}
          onShortcuts={(toggleShortcut, lockShortcut) =>
            update((d) => ({ ...d, settings: { ...d.settings, toggleShortcut, lockShortcut } }))
          }
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
