import { Flag, Trash2, X } from "lucide-react";
import { fromInputs, toDateInput, toTimeInput } from "../dates";
import type { AppData, Priority, Task } from "../types";

interface Props {
  data: AppData;
  task: Task;
  now: Date;
  onChange(patch: Partial<Task>): void;
  onDelete(): void;
  onClose(): void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
];

export function Inspector({ data, task, now, onChange, onDelete, onClose }: Props) {
  const list = data.lists.find((l) => l.id === task.listId);
  const date = task.dueAt ? toDateInput(task.dueAt) : "";
  const time = task.dueAt && task.dueHasTime ? toTimeInput(task.dueAt) : "";

  const setDate = (on: boolean) => {
    if (!on) return onChange({ dueAt: null, dueHasTime: false });
    onChange({ dueAt: fromInputs(toDateInput(now.toISOString()), "09:00"), dueHasTime: false });
  };
  const setTime = (on: boolean) => {
    if (!on) return onChange({ dueAt: fromInputs(date, "09:00"), dueHasTime: false });
    const next = new Date(now.getTime() + 60 * 60 * 1000);
    const base = date || toDateInput(now.toISOString());
    onChange({ dueAt: fromInputs(base, `${pad(next.getHours())}:00`), dueHasTime: true });
  };

  return (
    <aside className="inspector">
      <header>
        <h2>Details</h2>
        <button className="icon-btn" aria-label="Close details" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <input
        className="field title-field"
        value={task.title}
        placeholder="Title"
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <textarea
        className="field notes-field"
        value={task.notes}
        placeholder="Notes"
        rows={3}
        onChange={(e) => onChange({ notes: e.target.value })}
      />

      <div className="group">
        <label className="row">
          <span>Date</span>
          <Switch checked={!!task.dueAt} onChange={setDate} />
        </label>
        {task.dueAt && (
          <input
            type="date"
            className="field"
            value={date}
            onChange={(e) =>
              e.target.value && onChange({ dueAt: fromInputs(e.target.value, time || "09:00") })
            }
          />
        )}
        <label className="row">
          <span>Time</span>
          <Switch checked={task.dueHasTime} onChange={setTime} />
        </label>
        {task.dueHasTime && (
          <input
            type="time"
            className="field"
            value={time}
            onChange={(e) => e.target.value && onChange({ dueAt: fromInputs(date, e.target.value) })}
          />
        )}
      </div>

      <div className="group">
        <label className="row">
          <span className="with-icon">
            <Flag size={14} /> Flagged
          </span>
          <Switch checked={task.flagged} onChange={(flagged) => onChange({ flagged })} />
        </label>
        <label className="row">
          <span>Priority</span>
          <select
            value={task.priority}
            onChange={(e) => onChange({ priority: Number(e.target.value) as Priority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="group">
        <label className="row">
          <span>List</span>
          <select value={task.listId} onChange={(e) => onChange({ listId: e.target.value, section: null })}>
            {data.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {list && list.sections.length > 0 && (
          <label className="row">
            <span>Section</span>
            <select
              value={task.section ?? ""}
              onChange={(e) => onChange({ section: e.target.value || null })}
            >
              <option value="">Others</option>
              {list.sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> Delete Reminder
      </button>
    </aside>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange(checked: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch${checked ? " on" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
    >
      <span />
    </button>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
