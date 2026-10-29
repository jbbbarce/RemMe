import { BellRing, Flag, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { newId } from "../model";
import { REPEAT_LABELS, fromInputs, toDateInput, toTimeInput } from "../dates";
import { REPEATS, type AppData, type Priority, type Repeat, type Subtask, type Task } from "../types";

interface Props {
  data: AppData;
  task: Task;
  now: Date;
  onChange(patch: Partial<Task>): void;
  onDelete(): void;
  onClose(): void;
}

const NAG_MINUTES = [5, 10, 15, 30, 60];

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
    if (!on) return onChange({ dueAt: null, dueHasTime: false, repeat: null, nagMinutes: null });
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
        {task.dueAt && (
          <label className="row">
            <span>Repeat</span>
            <select
              value={task.repeat ?? ""}
              onChange={(e) => onChange({ repeat: (e.target.value || null) as Repeat | null })}
            >
              <option value="">Never</option>
              {REPEATS.map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        {task.dueAt && (
          <label className="row" title="Keep notifying until it's done">
            <span className="with-icon">
              <BellRing size={14} /> Nag
            </span>
            <select
              value={task.nagMinutes ?? ""}
              onChange={(e) => onChange({ nagMinutes: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Off</option>
              {NAG_MINUTES.map((m) => (
                <option key={m} value={m}>
                  Every {m === 60 ? "hour" : `${m} min`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <Subtasks subtasks={task.subtasks} onChange={(subtasks) => onChange({ subtasks })} />

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

function Subtasks({ subtasks, onChange }: { subtasks: Subtask[]; onChange(subtasks: Subtask[]): void }) {
  const [draft, setDraft] = useState("");
  const set = (id: string, patch: Partial<Subtask>) =>
    onChange(subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onChange([...subtasks, { id: newId(), title, done: false }]);
    setDraft("");
  };

  return (
    <div className="group">
      <span>Subtasks</span>
      {subtasks.map((s) => (
        <div key={s.id} className={`subtask${s.done ? " done" : ""}`}>
          <button
            className="check"
            aria-label={s.done ? "Mark subtask as not done" : "Mark subtask as done"}
            onClick={() => set(s.id, { done: !s.done })}
          >
            <span />
          </button>
          <input
            value={s.title}
            onChange={(e) => set(s.id, { title: e.target.value })}
            onBlur={() => !s.title.trim() && onChange(subtasks.filter((x) => x.id !== s.id))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <button className="icon-btn" aria-label="Delete subtask" onClick={() => onChange(subtasks.filter((x) => x.id !== s.id))}>
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="subtask">
        <Plus size={14} className="subtask-plus" />
        <input
          value={draft}
          placeholder="Add Subtask"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          onBlur={add}
        />
      </div>
    </div>
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
