import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  type CalendarItem,
  type CalendarMode,
  dayKey,
  itemsByDay,
  monthGrid,
  moveToDay,
  sameDay,
  shiftAnchor,
  undated,
  weekDays,
  weekStartDay,
} from "../calendar";
import { isOverdue } from "../dates";
import { insertTask, newTaskFor, updateTask } from "../model";
import { parseQuickAdd } from "../quickAdd";
import type { AppData, ReminderList, Task } from "../types";
import type { useTaskActions } from "./useTaskActions";

const MODE_KEY = "remme.calendar";
const NO_DATE_KEY = "remme.calendar.nodate";
const MONTH_LIMIT = 3;
const DRAG_TYPE = "text/task-id";

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
    // Remembering the calendar's layout is a convenience only.
  }
}

interface Props {
  data: AppData;
  now: Date;
  actions: ReturnType<typeof useTaskActions>;
  update(change: (d: AppData) => AppData): void;
  /** Opens a reminder's details. */
  onInfo(id: string): void;
}

/** Dated reminders from every list on a month or week grid. */
export function CalendarView({ data, now, actions, update, onInfo }: Props) {
  const weekStart = useMemo(() => weekStartDay(), []);
  const [mode, setMode] = useState<CalendarMode>(() => readLocal(MODE_KEY, "month"));
  const [anchor, setAnchor] = useState(() => now);
  const [showDone, setShowDone] = useState(false);
  const [noDateOpen, setNoDateOpen] = useState(() => readLocal(NO_DATE_KEY, true));
  const [adding, setAdding] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  useEffect(() => writeLocal(MODE_KEY, mode), [mode]);
  useEffect(() => writeLocal(NO_DATE_KEY, noDateOpen), [noDateOpen]);

  const days = mode === "month" ? monthGrid(anchor, weekStart) : weekDays(anchor, weekStart);
  const items = itemsByDay(data.tasks, days[0], days[days.length - 1], showDone);
  const listOf = (task: Task) => data.lists.find((l) => l.id === task.listId);
  const weekdayNames = days.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: "short" }));

  const title =
    mode === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  const moveTo = (id: string, day: Date | null) => {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return;
    // Taking the date away also ends a repeat or nag, which need a date.
    const patch = day ? moveToDay(task, day) : { dueAt: null, dueHasTime: false, repeat: null, nagMinutes: null };
    update((d) => updateTask(d, id, patch));
  };

  const addOn = (day: Date, text: string) => {
    const typed = text.trim();
    if (!typed) return;
    const parsed = parseQuickAdd(typed, new Date(), day);
    update((d) => {
      const task: Task = {
        ...newTaskFor(d, { kind: "smart", id: "all" }, now),
        ...parsed,
        dueAt: parsed.dueAt ?? moveToDay({ dueAt: null, dueHasTime: false } as Task, day).dueAt,
        dueHasTime: parsed.dueHasTime ?? false,
      };
      return insertTask(d, task);
    });
  };

  const dropHandlers = (key: string, day: Date | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropOn(key);
    },
    onDragLeave: () => setDropOn((k) => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropOn(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id) moveTo(id, day);
    },
  });

  const chip = (item: CalendarItem, key: string) => (
    <Chip
      key={key}
      item={item}
      list={listOf(item.task)}
      now={now}
      onToggle={(done) => actions.toggle(item.task, done)}
      onOpen={() => onInfo(item.task.id)}
    />
  );

  return (
    <div className="calendar">
      <header className="cal-head">
        <h1>{title}</h1>
        <div className="cal-controls">
          <button className="tool" onClick={() => setAnchor(new Date())}>
            Today
          </button>
          <button className="icon-btn" aria-label={`Previous ${mode}`} onClick={() => setAnchor((a) => shiftAnchor(a, mode, -1))}>
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn" aria-label={`Next ${mode}`} onClick={() => setAnchor((a) => shiftAnchor(a, mode, 1))}>
            <ChevronRight size={16} />
          </button>
          <div className="segmented" role="tablist" aria-label="Calendar view">
            {(["month", "week"] as const).map((m) => (
              <button key={m} className={`seg-text${mode === m ? " on" : ""}`} onClick={() => setMode(m)}>
                {m === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>
          <button className="link" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hide done" : "Show done"}
          </button>
          <button
            className="icon-btn"
            aria-label={noDateOpen ? "Hide reminders with no date" : "Show reminders with no date"}
            title="No date"
            onClick={() => setNoDateOpen(!noDateOpen)}
          >
            {noDateOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </header>

      <div className="cal-body">
        <div className={`cal-grid ${mode}`}>
          {weekdayNames.map((name) => (
            <div key={name} className="cal-weekday">
              {name}
            </div>
          ))}
          {days.map((day) => {
            const key = dayKey(day);
            const dayItems = items.get(key) ?? [];
            const shown = mode === "month" ? dayItems.slice(0, MONTH_LIMIT) : dayItems;
            const hidden = dayItems.length - shown.length;
            const outside = mode === "month" && day.getMonth() !== anchor.getMonth();
            return (
              <div
                key={key}
                className={`cal-day${outside ? " outside" : ""}${sameDay(day, now) ? " today" : ""}${dropOn === key ? " drop" : ""}`}
                onClick={(e) => e.target === e.currentTarget && setAdding(key)}
                {...dropHandlers(key, day)}
              >
                <span className="cal-date" onClick={() => setAdding(key)}>
                  {day.getDate()}
                </span>
                {shown.map((item, i) => chip(item, `${item.task.id}-${i}`))}
                {hidden > 0 && (
                  <button className="cal-more" onClick={() => setMoreFor(key)}>
                    +{hidden} more
                  </button>
                )}
                {adding === key && (
                  <AddBox
                    onDone={(text) => {
                      addOn(day, text);
                      setAdding(null);
                    }}
                  />
                )}
                {moreFor === key && (
                  <>
                    <div className="cal-pop-backdrop" onClick={() => setMoreFor(null)} />
                    <div className="cal-pop" role="dialog" aria-label={day.toLocaleDateString(undefined, { dateStyle: "full" })}>
                      <div className="cal-pop-title">{day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
                      {dayItems.map((item, i) => chip(item, `pop-${item.task.id}-${i}`))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {noDateOpen && (
          <aside className={`cal-nodate${dropOn === "nodate" ? " drop" : ""}`} aria-label="No date" {...dropHandlers("nodate", null)}>
            <h3>No date</h3>
            {undated(data.tasks, showDone).map((task) =>
              chip({ task, date: now, faded: false }, `nodate-${task.id}`),
            )}
            <p className="hint">Drag a reminder here to remove its date, or onto a day to give it one.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

/** One reminder on the calendar: tick it, open it, or drag it to another day. */
function Chip({
  item,
  list,
  now,
  onToggle,
  onOpen,
}: {
  item: CalendarItem;
  list: ReminderList | undefined;
  now: Date;
  onToggle(done: boolean): void;
  onOpen(): void;
}) {
  const { task, faded } = item;
  const overdue = !faded && isOverdue(task, now);
  const time = task.dueAt && task.dueHasTime ? item.date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div
      className={`cal-chip${faded ? " faded" : ""}${task.completed ? " done" : ""}${overdue ? " overdue" : ""}`}
      style={{ "--accent": `var(--c-${list?.color ?? "blue"})` } as React.CSSProperties}
      draggable={!faded}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={faded ? `${task.title} (repeats)` : task.title}
    >
      {!faded && (
        <button
          className="check"
          aria-label={task.completed ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(!task.completed);
          }}
        >
          <span />
        </button>
      )}
      {time && <span className="cal-time">{time}</span>}
      <span className="cal-title">{task.title || "Untitled"}</span>
    </div>
  );
}

/** Type a reminder straight into a day. Enter adds it; Esc or an empty box cancels. */
function AddBox({ onDone }: { onDone(text: string): void }) {
  const [text, setText] = useState("");
  // Enter closes the box, which can also blur it; finish only once.
  const finished = useRef(false);
  const finish = (value: string) => {
    if (finished.current) return;
    finished.current = true;
    onDone(value);
  };
  return (
    <input
      className="cal-add"
      autoFocus
      value={text}
      placeholder="New reminder"
      aria-label="New reminder on this day"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(text);
        if (e.key === "Escape") finish("");
      }}
      onBlur={() => finish(text)}
    />
  );
}
