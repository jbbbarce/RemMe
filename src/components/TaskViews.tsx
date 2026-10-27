import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatDue, isOverdue } from "../dates";
import { deleteSection, renameSection, upsertList } from "../model";
import type { AppData, ReminderList, Task, View } from "../types";
import { TaskRow } from "./TaskRow";
import type { useTaskActions } from "./useTaskActions";

type Actions = ReturnType<typeof useTaskActions>;

interface ViewProps {
  data: AppData;
  view: View;
  tasks: Task[];
  now: Date;
  actions: Actions;
  selectedId: string | null;
  onSelect(id: string): void;
  onInfo(id: string): void;
  update(change: (d: AppData) => AppData): void;
}

interface Group {
  key: string;
  title: string | null;
  color?: string;
  tasks: Task[];
}

function groupTasks(data: AppData, view: View, tasks: Task[], now: Date): Group[] {
  if (view.kind === "list") {
    const list = data.lists.find((l) => l.id === view.id);
    const sections = list?.sections ?? [];
    const groups: Group[] = [
      { key: "", title: sections.length ? "Others" : null, tasks: tasks.filter((t) => !t.section || !sections.includes(t.section)) },
      ...sections.map((s) => ({ key: s, title: s, tasks: tasks.filter((t) => t.section === s) })),
    ];
    return groups.filter((g, i) => i === 0 || g.tasks.length > 0);
  }
  if (view.kind === "smart" && view.id === "completed") {
    return [{ key: "all", title: null, tasks }];
  }
  if (view.kind === "smart" && view.id === "scheduled") {
    const groups = new Map<string, Group>();
    for (const task of tasks) {
      const title = isOverdue(task, now) ? "Overdue" : formatDue({ ...task, dueHasTime: false }, now);
      if (!groups.has(title)) groups.set(title, { key: title, title, tasks: [] });
      groups.get(title)!.tasks.push(task);
    }
    return [...groups.values()];
  }
  return data.lists
    .map((l) => ({ key: l.id, title: l.name, color: l.color, tasks: tasks.filter((t) => t.listId === l.id) }))
    .filter((g) => g.tasks.length > 0);
}

export function ListView({ data, view, tasks, now, actions, selectedId, onSelect, onInfo }: ViewProps) {
  const groups = groupTasks(data, view, tasks, now);
  const canAdd = view.kind !== "search" && !(view.kind === "smart" && view.id === "completed");
  const listOf = (t: Task) => data.lists.find((l) => l.id === t.listId);
  const multiList = view.kind !== "list";

  return (
    <div className="list-view">
      {groups.map((group) => (
        <section key={group.key} className="group-block">
          {group.title && (
            <h3 className="group-title" style={group.color ? { color: `var(--c-${group.color})` } : undefined}>
              {group.title}
            </h3>
          )}
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              list={listOf(task)}
              now={now}
              selected={task.id === selectedId}
              autoFocus={task.id === actions.focusId}
              showList={multiList && view.kind !== "smart"}
              onToggle={(done) => actions.toggle(task, done)}
              onChange={(patch) => actions.change(task.id, patch)}
              onSelect={() => onSelect(task.id)}
              onInfo={() => onInfo(task.id)}
              onEnter={() => actions.add(task.id, { listId: task.listId, section: task.section })}
              onEmpty={() => actions.remove(task.id)}
            />
          ))}
          {canAdd && view.kind === "list" && group.key !== "" && (
            <AddRow onAdd={() => actions.add(group.tasks.at(-1)?.id, { section: group.key })} />
          )}
        </section>
      ))}
      {canAdd && <AddRow onAdd={() => actions.add()} />}
      {!canAdd && tasks.length === 0 && <p className="empty">Nothing here.</p>}
    </div>
  );
}

function AddRow({ onAdd }: { onAdd(): void }) {
  return (
    <button className="add-row" onClick={onAdd}>
      <Plus size={16} />
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

export function BoardView({ data, view, tasks, now, actions, selectedId, onSelect, onInfo, update }: ViewProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");
  const list = view.kind === "list" ? data.lists.find((l) => l.id === view.id) : undefined;
  const listOf = (t: Task) => data.lists.find((l) => l.id === t.listId);

  let columns: Column[];
  if (list) {
    columns = [
      {
        key: "",
        title: "Others",
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
    const name = newSection.trim();
    if (!name || current.sections.includes(name)) return;
    update((d) => upsertList(d, { ...current, sections: [...current.sections, name] }));
    setNewSection("");
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
            const id = e.dataTransfer.getData("text/task-id");
            if (id) actions.change(id, col.patch);
          }}
        >
          <header className="column-head">
            {col.section && list ? (
              <SectionTitle list={list} name={col.section} update={update} />
            ) : (
              <h3 style={{ color: list ? undefined : `var(--c-${col.color})` }}>{col.title}</h3>
            )}
            <span className="column-count">{col.tasks.filter((t) => !t.completed).length}</span>
          </header>
          {col.tasks.map((task) => (
            <div
              key={task.id}
              className="card"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
            >
              <TaskRow
                task={task}
                list={listOf(task)}
                now={now}
                compact
                selected={task.id === selectedId}
                autoFocus={task.id === actions.focusId}
                onToggle={(done) => actions.toggle(task, done)}
                onChange={(patch) => actions.change(task.id, patch)}
                onSelect={() => onSelect(task.id)}
                onInfo={() => onInfo(task.id)}
                onEnter={() => actions.add(task.id, { ...col.patch })}
                onEmpty={() => actions.remove(task.id)}
              />
            </div>
          ))}
          {canAdd && (
            <button className="add-card" onClick={() => actions.add(col.tasks.at(-1)?.id, { ...col.patch })}>
              <Plus size={15} />
            </button>
          )}
        </div>
      ))}
      {list && (
        <div className="column new-section">
          <input
            value={newSection}
            placeholder="Add Section"
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSection(list)}
            onBlur={() => addSection(list)}
          />
        </div>
      )}
    </div>
  );
}

function SectionTitle({ list, name, update }: { list: ReminderList; name: string; update: ViewProps["update"] }) {
  const [draft, setDraft] = useState(name);
  return (
    <div className="section-title">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next && next !== name) update((d) => renameSection(d, list.id, name, next));
          else setDraft(name);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <button
        className="icon-btn"
        aria-label={`Delete section ${name}`}
        title="Delete section (its reminders move to Others)"
        onClick={() => update((d) => deleteSection(d, list.id, name))}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
