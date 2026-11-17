import { Add, AlertOff, Delete, Dismiss, Timer } from "../icons";
import { Dropdown } from "./ui";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Popover } from "radix-ui";
import { invoke } from "@tauri-apps/api/core";
import { activeSnooze, detailsInfo, newId, snoozeLabel } from "../model";
import { startFocus } from "../pomodoro";
import {
  DAY_PRESETS,
  DAY_PRESET_LABELS,
  NO_DUE,
  REPEAT_LABELS,
  TIME_PRESETS,
  dueAtTime,
  dueOnDay,
  formatDue,
  presetDay,
  shortDay,
  timeLabel,
  toDateInput,
  toTimeInput,
} from "../dates";
import { dayKey, monthGrid, sameDay, shiftAnchor, weekStartDay } from "../calendar";
import { ChevronLeft, ChevronRight } from "../icons";
import { REPEATS, type AppData, type Priority, type Repeat, type Subtask, type Task } from "../types";

interface Props {
  data: AppData;
  task: Task;
  now: Date;
  /** Typing in the title, notes, subtasks and app box: no Undo toast. */
  onChange(patch: Partial<Task>): void;
  /** Clicked controls: they offer Undo. */
  onQuickChange(patch: Partial<Task>): void;
  onToggle(completed: boolean): void;
  onDelete(): void;
  onClose(): void;
}

const NAG_MINUTES = [5, 10, 15, 30, 60];
const PRIORITY_CHOICES: { value: Priority; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
];

const WIDTH_KEY = "remme.inspector";
const MIN_WIDTH = 280;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 320;

const clampWidth = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));

function readWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved ? clampWidth(saved) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function writeWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // The width is a convenience only.
  }
}

/** Grows a text box to fit its text. */
function useFit(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

/** The details panel: everything about one reminder, in four groups. */
export function Inspector({ data, task, now, onChange, onQuickChange, onToggle, onDelete, onClose }: Props) {
  const [width, setWidth] = useState(readWidth);
  const list = data.lists.find((l) => l.id === task.listId);
  const snoozed = activeSnooze(task, now);
  const title = useFit(task.title);
  const notes = useFit(task.notes);
  const info = detailsInfo(task, now);

  const resize = (next: number) => {
    const w = clampWidth(next);
    setWidth(w);
    writeWidth(w);
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setWidth(clampWidth(startW + (startX - ev.clientX)));
    const end = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      resize(startW + (startX - ev.clientX));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key !== "Escape" || target.closest("input, textarea, [role='menu'], [role='listbox']")) return;
    e.preventDefault();
    onClose();
  };

  return (
    <aside className="inspector" style={{ width }} aria-label="Details" onKeyDown={onKeyDown}>
      <div
        className="insp-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize details"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize; double-click to reset"
        onPointerDown={startDrag}
        onDoubleClick={() => resize(DEFAULT_WIDTH)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") resize(width + 16);
          else if (e.key === "ArrowRight") resize(width - 16);
          else return;
          e.preventDefault();
        }}
      />
      <header className="insp-head">
        <h2>Details</h2>
        {list && (
          <span className="insp-list">
            <span className="menu-dot" style={{ background: `var(--c-${list.color})` }} />
            {list.name}
          </span>
        )}
        <button className="icon-btn" aria-label="Close details" title="Close (Esc)" onClick={onClose}>
          <Dismiss size={16} />
        </button>
      </header>

      <div className="insp-scroll">
        <div className="insp-title-row">
          <button
            className="check"
            style={{ "--accent": `var(--c-${list?.color ?? "blue"})` } as React.CSSProperties}
            aria-label={task.completed ? "Mark as not completed" : "Mark as completed"}
            aria-pressed={task.completed}
            onClick={() => onToggle(!task.completed)}
          >
            <span />
          </button>
          <textarea
            ref={title}
            className={`insp-title${task.completed ? " done" : ""}`}
            rows={1}
            value={task.title}
            placeholder="New Reminder"
            aria-label="Title"
            spellCheck={false}
            onChange={(e) => onChange({ title: e.target.value.replace(/\n/g, "") })}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          />
        </div>
        <textarea
          ref={notes}
          className="insp-notes"
          rows={1}
          value={task.notes}
          placeholder="Add notes"
          aria-label="Notes"
          onChange={(e) => onChange({ notes: e.target.value })}
        />

        <section className="insp-group" aria-labelledby="insp-when">
          <h3 id="insp-when">When</h3>
          <WhenControls task={task} now={now} onChange={onQuickChange} />
          {task.dueAt && (
            <div className="insp-row">
              <span>Repeat</span>
              <Dropdown
                label="Repeat"
                value={task.repeat ?? ""}
                onChange={(v) => onQuickChange({ repeat: (v || null) as Repeat | null })}
                options={[{ value: "", label: "Never" }, ...REPEATS.map((r) => ({ value: r, label: REPEAT_LABELS[r] }))]}
              />
            </div>
          )}
        </section>

        <section className="insp-group" aria-labelledby="insp-alerts">
          <h3 id="insp-alerts">Alerts</h3>
          {task.dueAt && (
            <div className="insp-row" title="Keep notifying until it's done">
              <span>Nag</span>
              <Dropdown
                label="Nag"
                value={task.nagMinutes ? String(task.nagMinutes) : ""}
                onChange={(v) => onQuickChange({ nagMinutes: v ? Number(v) : null })}
                options={[
                  { value: "", label: "Off" },
                  ...NAG_MINUTES.map((m) => ({ value: String(m), label: `Every ${m === 60 ? "hour" : `${m} min`}` })),
                ]}
              />
            </div>
          )}
          {snoozed && (
            <div className="insp-row snooze-row">
              <span className="with-icon">
                <AlertOff size={14} /> {snoozeLabel(snoozed, now)}
              </span>
              <button className="link-btn" onClick={() => onQuickChange({ snoozedUntil: null })}>
                Stop snoozing
              </button>
            </div>
          )}
          <AppTrigger value={task.appTrigger} onChange={(appTrigger) => onChange({ appTrigger })} />
        </section>

        <Subtasks subtasks={task.subtasks} onChange={(subtasks) => onChange({ subtasks })} />

        <section className="insp-group" aria-labelledby="insp-organise">
          <h3 id="insp-organise">Organise</h3>
          <div className="insp-row">
            <span>List</span>
            <Dropdown
              label="List"
              value={task.listId}
              onChange={(listId) => onQuickChange({ listId, section: null })}
              options={data.lists.map((l) => ({ value: l.id, label: l.name }))}
            />
          </div>
          {list && list.sections.length > 0 && (
            <div className="insp-row">
              <span>Section</span>
              <Dropdown
                label="Section"
                value={task.section ?? ""}
                onChange={(v) => onQuickChange({ section: v || null })}
                options={[{ value: "", label: "Others" }, ...list.sections.map((s) => ({ value: s, label: s }))]}
              />
            </div>
          )}
          <div className="insp-row">
            <span id="insp-priority">Priority</span>
            <div className="segmented small" role="radiogroup" aria-labelledby="insp-priority">
              {PRIORITY_CHOICES.map((p) => (
                <button
                  key={p.value}
                  role="radio"
                  aria-checked={task.priority === p.value}
                  className={task.priority === p.value ? "on" : ""}
                  onClick={() => onQuickChange({ priority: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <label className="insp-row">
            <span>Flagged</span>
            <Switch checked={task.flagged} onChange={(flagged) => onQuickChange({ flagged })} />
          </label>
        </section>
      </div>

      <footer className="insp-footer">
        {info.length > 0 && <p className="insp-info">{info.join(" · ")}</p>}
        <div className="insp-actions">
          {!task.completed && (
            <button className="btn" onClick={() => startFocus(task.id)}>
              <Timer size={15} /> Focus on this
            </button>
          )}
          <button className="btn danger-text" onClick={onDelete}>
            <Delete size={15} /> Delete
          </button>
        </div>
      </footer>
    </aside>
  );
}

/** The date (text, ×, and day chips with a month picker) and, for a dated reminder, the time chips and field. */
function WhenControls({ task, now, onChange }: { task: Task; now: Date; onChange(patch: Partial<Task>): void }) {
  const day = task.dueAt ? toDateInput(task.dueAt) : "";
  const time = task.dueAt && task.dueHasTime ? toTimeInput(task.dueAt) : "";
  return (
    <>
      <div className="insp-row">
        <span>Date</span>
        <span className="insp-value">
          {task.dueAt ? formatDue({ dueAt: task.dueAt, dueHasTime: false }, now) : "None"}
          {task.dueAt && (
            <button className="icon-btn" aria-label="Remove date" title="Remove date" onClick={() => onChange(NO_DUE)}>
              <Dismiss size={12} />
            </button>
          )}
        </span>
      </div>
      <div className="due-chips" role="group" aria-label="Date">
        {DAY_PRESETS.map((p) => {
          const d = presetDay(p, now);
          return (
            <button
              key={p}
              className="btn"
              aria-pressed={day === toDateInput(d.toISOString())}
              title={shortDay(d)}
              onClick={() => onChange(dueOnDay(task, d))}
            >
              {DAY_PRESET_LABELS[p]}
            </button>
          );
        })}
        <MonthPicker value={task.dueAt ? new Date(task.dueAt) : null} now={now} onPick={(d) => onChange(dueOnDay(task, d))} />
      </div>
      {task.dueAt && (
        <>
          <div className="insp-row">
            <span>Time</span>
            <span className="insp-value">{time ? timeLabel(time) : "None"}</span>
          </div>
          <div className="due-chips" role="group" aria-label="Time">
            <button className="btn" aria-pressed={!time} onClick={() => onChange(dueAtTime(task, null, now))}>
              No time
            </button>
            {TIME_PRESETS.map((t) => (
              <button key={t} className="btn" aria-pressed={time === t} onClick={() => onChange(dueAtTime(task, t, now))}>
                {t === "12:00" ? "Noon" : timeLabel(t)}
              </button>
            ))}
            <input
              type="time"
              className="field insp-time"
              aria-label="Other time"
              value={time}
              onChange={(e) => e.target.value && onChange(dueAtTime(task, e.target.value, now))}
            />
          </div>
        </>
      )}
    </>
  );
}

/** "Pick…": a themed month calendar in a popover. */
function MonthPicker({ value, now, onPick }: { value: Date | null; now: Date; onPick(day: Date): void }) {
  const weekStart = useMemo(() => weekStartDay(), []);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(() => value ?? now);
  const days = monthGrid(anchor, weekStart);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setAnchor(value ?? now);
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button className="btn">Pick…</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu month-pop" side="bottom" align="end" sideOffset={4} collisionPadding={6}>
          <div className="mini-cal-head">
            <button className="icon-btn" aria-label="Previous month" onClick={() => setAnchor((a) => shiftAnchor(a, "month", -1))}>
              <ChevronLeft size={14} />
            </button>
            <span className="mini-cal-title">{anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            <button className="icon-btn" aria-label="Next month" onClick={() => setAnchor((a) => shiftAnchor(a, "month", 1))}>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="mini-cal-grid">
            {days.slice(0, 7).map((d) => (
              <span key={`w${d.getDay()}`} className="mini-cal-weekday">
                {d.toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
            ))}
            {days.map((d) => (
              <button
                key={dayKey(d)}
                className={`mini-cal-day${d.getMonth() !== anchor.getMonth() ? " outside" : ""}${sameDay(d, now) ? " today" : ""}${value && sameDay(d, value) ? " on" : ""}`}
                aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
                aria-pressed={!!value && sameDay(d, value)}
                onClick={() => {
                  onPick(d);
                  setOpen(false);
                }}
              >
                {d.getDate()}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AppTrigger({ value, onChange }: { value: string | null; onChange(value: string | null): void }) {
  const [apps, setApps] = useState<string[]>([]);
  return (
    <div className="insp-app">
      <label htmlFor="insp-app-field">Remind me when I open an app</label>
      <input
        id="insp-app-field"
        className="field"
        list="running-apps"
        value={value ?? ""}
        placeholder="e.g. chrome.exe"
        spellCheck={false}
        onFocus={() => invoke<string[]>("running_apps").then(setApps, () => setApps([]))}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
      />
      <p className="insp-hint">You get a notification each time it starts, until this is done.</p>
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
  const done = subtasks.filter((s) => s.done).length;

  return (
    <section className="insp-group" aria-labelledby="insp-subtasks">
      <h3 id="insp-subtasks">
        Subtasks
        {subtasks.length > 0 && (
          <span className="insp-count">
            {done}/{subtasks.length}
          </span>
        )}
      </h3>
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
            aria-label="Subtask"
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
          placeholder="Add subtask"
          aria-label="Add subtask"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          onBlur={add}
        />
      </div>
    </section>
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
