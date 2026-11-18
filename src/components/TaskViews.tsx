import { Add, ChevronLeft, ChevronRight, Delete, Edit, Grip, LIST_ICON_COMPONENTS, More, SMART_ICONS, Search } from "../icons";
import { useState } from "react";
import { NO_SECTION, dayGroups, deleteSection, emptyMessage, moveSection, renameSection, restoreSection, upsertList } from "../model";
import { startFocus } from "../pomodoro";
import type { AppData, ReminderList, Task, View } from "../types";
import { TaskRow } from "./TaskRow";
import { TASK_DRAG, useRowDrag } from "./useRowDrag";
import type { useTaskActions } from "./useTaskActions";
import type { UndoState } from "./Undo";
import { Menu } from "./ui";

type Actions = ReturnType<typeof useTaskActions>;

interface ViewProps {
  data: AppData;
  view: View;
  tasks: Task[];
  now: Date;
  actions: Actions;
  /** The selected reminders; more than one is a multi-selection. */
  selectedIds: readonly string[];
  onSelect(id: string, mode?: "toggle" | "range"): void;
  onInfo(id: string): void;
  update(change: (d: AppData) => AppData): void;
  /** Finished reminders hidden because Show done is off, for the empty view's hint. */
  hiddenDone?: number;
  /** For Undo after deleting a board section. */
  undo?: UndoState;
}

interface Group {
  key: string;
  title: string | null;
  color?: string;
  overdue?: boolean;
  tasks: Task[];
}

/** Today and Upcoming group reminders by day rather than by list. */
function byDay(view: View): boolean {
  return view.kind === "smart" && (view.id === "today" || view.id === "scheduled");
}

/** Row props shared by the list and the board: selection, search marks, and the menu acting on a multi-selection. */
function rowSelection({ view, actions, selectedIds, onSelect }: ViewProps, task: Task) {
  const many = selectedIds.length > 1 && selectedIds.includes(task.id);
  return {
    selected: selectedIds.includes(task.id),
    onSelect: (mode?: "toggle" | "range") => onSelect(task.id, mode),
    highlight: view.kind === "search" ? view.query : undefined,
    group: many
      ? {
          count: selectedIds.length,
          onChange: (patch: Partial<Task>) => actions.quickMany(selectedIds, patch),
          onDelete: () => actions.removeMany(selectedIds),
        }
      : undefined,
  };
}

function groupTasks(data: AppData, view: View, tasks: Task[], now: Date): Group[] {
  if (view.kind === "list") {
    const list = data.lists.find((l) => l.id === view.id);
    const sections = list?.sections ?? [];
    const groups: Group[] = [
      { key: "", title: sections.length ? NO_SECTION : null, tasks: tasks.filter((t) => !t.section || !sections.includes(t.section)) },
      ...sections.map((s) => ({ key: s, title: s, tasks: tasks.filter((t) => t.section === s) })),
    ];
    return groups.filter((g, i) => i === 0 || g.tasks.length > 0);
  }
  if (view.kind === "smart" && view.id === "completed") {
    return [{ key: "all", title: null, tasks }];
  }
  if (byDay(view)) {
    const groups = dayGroups(tasks, now);
    // Today with nothing overdue needs no heading under its title.
    if (view.kind === "smart" && view.id === "today" && groups.length === 1) return [{ ...groups[0], title: null }];
    return groups;
  }
  return data.lists
    .map((l) => ({ key: l.id, title: l.name, color: l.color, tasks: tasks.filter((t) => t.listId === l.id) }))
    .filter((g) => g.tasks.length > 0);
}

export function ListView(props: ViewProps) {
  const { data, view, tasks, now, actions, onInfo } = props;
  const groups = groupTasks(data, view, tasks, now);
  const canAdd = view.kind !== "search" && !(view.kind === "smart" && view.id === "completed");
  const listOf = (t: Task) => data.lists.find((l) => l.id === t.listId);
  // Search groups by list already; Today and Upcoming group by day, so their rows name the list.
  const showList = byDay(view);
  // Only a list keeps the order you give it; smart lists sort by date.
  const drag = useRowDrag(actions.move, view.kind === "list");

  return (
    <div className="list-view">
      {groups.map((group) => (
        <section key={group.key} className="group-block">
          {group.title && (
            <h3 className={`group-title${group.overdue ? " overdue" : ""}`} style={group.color ? { color: `var(--c-${group.color})` } : undefined}>
              {group.title}
            </h3>
          )}
          {group.tasks.map((task) => (
            <div key={task.id} className="drag-row" {...drag(task.id)}>
            {view.kind === "list" && (
              <span className="grip" aria-hidden>
                <Grip size={14} />
              </span>
            )}
            <TaskRow
              task={task}
              list={listOf(task)}
              now={now}
              {...rowSelection(props, task)}
              autoFocus={task.id === actions.focusId}
              showList={showList}
              onToggle={(done) => actions.toggle(task, done)}
              onChange={(patch) => actions.change(task.id, patch)}
              onInfo={() => onInfo(task.id)}
              onFocus={() => startFocus(task.id)}
              onEnter={() => actions.add(task.id, { listId: task.listId, section: task.section })}
              onEmpty={(before) => actions.removeEmptied(task, before)}
              onCommit={() => actions.commit(task)}
              lists={data.lists}
              onDelete={() => actions.remove(task.id)}
              onQuickChange={(patch) => actions.quick(task.id, patch)}
              preview={actions.isFresh(task.id)}
            />
            </div>
          ))}
          {canAdd && view.kind === "list" && group.key !== "" && (
            <AddRow onAdd={() => actions.add(group.tasks.at(-1)?.id, { section: group.key })} />
          )}
        </section>
      ))}
      {tasks.length === 0 && <EmptyView data={data} view={view} hiddenDone={props.hiddenDone ?? 0} />}
      {canAdd && <AddRow onAdd={() => actions.add()} />}
    </div>
  );
}

/** An empty view: its icon, what would show up here, and how to get it there. */
function EmptyView({ data, view, hiddenDone }: { data: AppData; view: View; hiddenDone: number }) {
  const { title, hint } = emptyMessage(view, hiddenDone);
  const Icon =
    view.kind === "smart"
      ? SMART_ICONS[view.id]
      : view.kind === "list"
        ? LIST_ICON_COMPONENTS[data.lists.find((l) => l.id === view.id)?.icon ?? "list"]
        : Search;
  return (
    <div className="empty-view" role="status">
      <Icon size={36} />
      <p className="empty-title">{title}</p>
      <p className="empty-hint">{hint}</p>
    </div>
  );
}

function AddRow({ onAdd }: { onAdd(): void }) {
  return (
    <button className="add-row" onClick={onAdd}>
      <Add size={16} />
      New Reminder
    </button>
  );
}

interface Column {
  key: string;
  title: string;
  color: string;
  tasks: Task[];
  /** What a task gets when dropped in or created in this column. */
  patch: Partial<Task>;
  section?: string;
}

export function BoardView(props: ViewProps) {
  const { data, view, tasks, now, actions, onInfo, update, undo } = props;
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Dropping a card on another card puts it there, in that card's column.
  const cardDrag = useRowDrag(actions.move);
  const [newSection, setNewSection] = useState<string | null>(null);
  const list = view.kind === "list" ? data.lists.find((l) => l.id === view.id) : undefined;
  const listOf = (t: Task) => data.lists.find((l) => l.id === t.listId);

  let columns: Column[];
  if (list) {
    columns = [
      {
        key: "",
        title: NO_SECTION,
        color: list.color,
        tasks: tasks.filter((t) => !t.section || !list.sections.includes(t.section)),
        patch: { section: null },
      },
      ...list.sections.map((s) => ({
        key: s,
        title: s,
        color: list.color,
        tasks: tasks.filter((t) => t.section === s),
        patch: { section: s },
        section: s,
      })),
    ];
  } else {
    columns = data.lists.map((l) => ({
      key: l.id,
      title: l.name,
      color: l.color,
      tasks: tasks.filter((t) => t.listId === l.id),
      patch: { listId: l.id, section: null },
    }));
  }
  const canAdd = view.kind !== "search" && !(view.kind === "smart" && view.id === "completed");

  const addSection = (current: ReminderList) => {
    const name = (newSection ?? "").trim();
    setNewSection(null);
    if (!name || current.sections.includes(name)) return;
    update((d) => upsertList(d, { ...current, sections: [...current.sections, name] }));
  };

  return (
    <div className="board">
      {columns.map((col) => (
        <div
          key={col.key}
          className={`column${dragOver === col.key ? " drop" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(col.key);
          }}
          onDragLeave={() => setDragOver((k) => (k === col.key ? null : k))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(null);
            const id = e.dataTransfer.getData(TASK_DRAG);
            if (id) actions.quick(id, col.patch);
          }}
        >
          <header className="column-head">
            {col.section && list ? (
              <SectionHeader list={list} name={col.section} data={data} update={update} undo={undo} />
            ) : (
              <h3 style={{ color: list ? undefined : `var(--c-${col.color})` }}>{col.title}</h3>
            )}
            <span className="column-count">{col.tasks.filter((t) => !t.completed).length}</span>
          </header>
          {col.tasks.map((task) => (
            <div key={task.id} className="card" {...cardDrag(task.id)}>
              <TaskRow
                task={task}
                list={listOf(task)}
                now={now}
                compact
                {...rowSelection(props, task)}
                autoFocus={task.id === actions.focusId}
                onToggle={(done) => actions.toggle(task, done)}
                onChange={(patch) => actions.change(task.id, patch)}
                onInfo={() => onInfo(task.id)}
                onFocus={() => startFocus(task.id)}
                onEnter={() => actions.add(task.id, { ...col.patch })}
                onEmpty={(before) => actions.removeEmptied(task, before)}
                onCommit={() => actions.commit(task)}
                lists={data.lists}
                onDelete={() => actions.remove(task.id)}
                onQuickChange={(patch) => actions.quick(task.id, patch)}
                preview={actions.isFresh(task.id)}
              />
            </div>
          ))}
          {canAdd && (
            <button className="add-card" onClick={() => actions.add(col.tasks.at(-1)?.id, { ...col.patch })}>
              <Add size={15} />
              Add reminder
            </button>
          )}
        </div>
      ))}
      {list && (
        <div className="column new-section">
          {newSection === null ? (
            <button className="add-card" onClick={() => setNewSection("")}>
              <Add size={15} />
              Add section
            </button>
          ) : (
            <input
              autoFocus
              value={newSection}
              placeholder="Section name"
              aria-label="New section name"
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSection(list);
                if (e.key === "Escape") setNewSection(null);
              }}
              onBlur={() => addSection(list)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A section column's name, with a ⋯ menu to rename, move or delete it. Double-click the name to rename. */
function SectionHeader({
  list,
  name,
  data,
  update,
  undo,
}: {
  list: ReminderList;
  name: string;
  data: AppData;
  update: ViewProps["update"];
  undo?: UndoState;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const index = list.sections.indexOf(name);

  const finish = () => {
    const next = draft.trim();
    if (next && next !== name) update((d) => renameSection(d, list.id, name, next));
    else setDraft(name);
    setEditing(false);
  };

  const remove = () => {
    // Undo puts the section and its reminders back.
    const sections = list.sections;
    const ids = data.tasks.filter((t) => t.listId === list.id && t.section === name).map((t) => t.id);
    update((d) => deleteSection(d, list.id, name));
    undo?.show(`Deleted section “${name}”`, (d) => restoreSection(d, list.id, sections, name, ids));
  };

  return (
    <div className="section-title">
      {editing ? (
        <input
          autoFocus
          value={draft}
          aria-label="Section name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <h3 onDoubleClick={() => setEditing(true)} title="Double-click to rename">
          {name}
        </h3>
      )}
      <Menu
        align="end"
        trigger={
          <button className="icon-btn" aria-label={`Section ${name} options`}>
            <More size={15} />
          </button>
        }
        items={[
          { label: "Rename", icon: <Edit size={16} />, onSelect: () => window.setTimeout(() => setEditing(true), 0) },
          {
            label: "Move left",
            icon: <ChevronLeft size={16} />,
            disabled: index <= 0,
            onSelect: () => update((d) => moveSection(d, list.id, name, -1)),
          },
          {
            label: "Move right",
            icon: <ChevronRight size={16} />,
            disabled: index >= list.sections.length - 1,
            onSelect: () => update((d) => moveSection(d, list.id, name, 1)),
          },
          { label: "Delete section", icon: <Delete size={16} />, danger: true, separated: true, onSelect: remove },
        ]}
      />
    </div>
  );
}
