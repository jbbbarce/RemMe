import { Add, AlertOff, AlertUrgent, Delete, Dismiss, Flag, Timer, Window } from "../icons";
import { Dropdown } from "./ui";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { activeSnooze, newId, snoozeLabel } from "../model";
import { startFocus } from "../pomodoro";
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
  const snoozed = activeSnooze(task, now);

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
          <Dismiss size={16} />
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
          <div className="row">
            <span>Repeat</span>
            <Dropdown
              label="Repeat"
              value={task.repeat ?? ""}
              onChange={(v) => onChange({ repeat: (v || null) as Repeat | null })}
              options={[{ value: "", label: "Never" }, ...REPEATS.map((r) => ({ value: r, label: REPEAT_LABELS[r] }))]}
            />
          </div>
        )}
        {task.dueAt && (
          <div className="row" title="Keep notifying until it's done">
            <span className="with-icon">
              <AlertUrgent size={14} /> Nag
            </span>
            <Dropdown
              label="Nag"
              value={task.nagMinutes ? String(task.nagMinutes) : ""}
              onChange={(v) => onChange({ nagMinutes: v ? Number(v) : null })}
              options={[
                { value: "", label: "Off" },
                ...NAG_MINUTES.map((m) => ({ value: String(m), label: `Every ${m === 60 ? "hour" : `${m} min`}` })),
              ]}
            />
          </div>
        )}
        {snoozed && (
          <div className="row snooze-row">
            <span className="with-icon">
              <AlertOff size={14} /> {snoozeLabel(snoozed, now)}
            </span>
            <button className="link-btn" onClick={() => onChange({ snoozedUntil: null })}>
              Clear
            </button>
          </div>
        )}
      </div>

      <AppTrigger value={task.appTrigger} onChange={(appTrigger) => onChange({ appTrigger })} />

      <Subtasks subtasks={task.subtasks} onChange={(subtasks) => onChange({ subtasks })} />

      <div className="group">
        <label className="row">
          <span className="with-icon">
            <Flag size={14} /> Flagged
          </span>
          <Switch checked={task.flagged} onChange={(flagged) => onChange({ flagged })} />
        </label>
        <div className="row">
          <span>Priority</span>
          <Dropdown
            label="Priority"
            value={String(task.priority)}
            onChange={(v) => onChange({ priority: Number(v) as Priority })}
            options={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))}
          />
        </div>
      </div>

      <div className="group">
        <div className="row">
          <span>List</span>
          <Dropdown
            label="List"
            value={task.listId}
            onChange={(listId) => onChange({ listId, section: null })}
            options={data.lists.map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>
        {list && list.sections.length > 0 && (
          <div className="row">
            <span>Section</span>
            <Dropdown
              label="Section"
              value={task.section ?? ""}
              onChange={(v) => onChange({ section: v || null })}
              options={[{ value: "", label: "Others" }, ...list.sections.map((s) => ({ value: s, label: s }))]}
            />
          </div>
        )}
      </div>

      {!task.completed && (
        <button className="focus-btn" onClick={() => startFocus(task.id)}>
          <Timer size={15} /> Focus on this
          {task.pomodoros > 0 && <span className="focus-count">{task.pomodoros} done</span>}
        </button>
      )}

      <button className="danger" onClick={onDelete}>
        <Delete size={15} /> Delete Reminder
      </button>
    </aside>
  );
}

function AppTrigger({ value, onChange }: { value: string | null; onChange(value: string | null): void }) {
  const [apps, setApps] = useState<string[]>([]);
  return (
    <div className="group">
      <label className="row" title="Get a notification each time this app opens, until the reminder is done">
        <span className="with-icon">
          <Window size={14} /> When I open
        </span>
        <input
          className="field app-field"
          list="running-apps"
          value={value ?? ""}
          placeholder="e.g. chrome.exe"
          spellCheck={false}
          onFocus={() => invoke<string[]>("running_apps").then(setApps, () => setApps([]))}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
        />
      </label>
      <datalist id="running-apps">
        {apps.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </div>
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
            <Dismiss size={13} />
          </button>
        </div>
      ))}
      <div className="subtask">
        <Add size={14} className="subtask-plus" />
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
