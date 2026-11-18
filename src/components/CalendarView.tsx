import { TASK_DRAG } from "./useRowDrag";
import { Checkmark, ChevronLeft, ChevronRight, PanelOpen, Repeat } from "../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type CalendarItem,
  type CalendarMode,
  dayKey,
  itemsByDay,
  monthGrid,
  moveToDay,
  sameDay,
  shiftAnchor,
  splitRepeats,
  undated,
  weekDays,
  weekStartDay,
} from "../calendar";
import { isOverdue } from "../dates";
import { insertTask, newTaskFor } from "../model";
import { parseQuickAdd } from "../quickAdd";
import type { AppData, ReminderList, Task } from "../types";
import type { useTaskActions } from "./useTaskActions";

const MODE_KEY = "remme.calendar";
const NO_DATE_KEY = "remme.calendar.nodate";
const DONE_KEY = "remme.calendar.done";
const REPEATS_KEY = "remme.calendar.repeats";
/** At most this many reminders per month cell; a shorter window shows fewer so "+N more" stays in view. */
const MONTH_LIMIT = 3;
/** About how tall a two-line chip is, and the date row with "+N more", in a month cell. */
const CHIP_PX = 36;
const CELL_EXTRA_PX = 44;
const DRAG_TYPE = TASK_DRAG;

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
  const [showDone, setShowDone] = useState(() => readLocal(DONE_KEY, false));
  const [showRepeats, setShowRepeats] = useState(() => readLocal(REPEATS_KEY, false));
  const [noDateOpen, setNoDateOpen] = useState(() => readLocal(NO_DATE_KEY, true));
  const [adding, setAdding] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [cellHeight, setCellHeight] = useState(0);

  useEffect(() => writeLocal(MODE_KEY, mode), [mode]);
  useEffect(() => writeLocal(NO_DATE_KEY, noDateOpen), [noDateOpen]);
  useEffect(() => writeLocal(DONE_KEY, showDone), [showDone]);
  useEffect(() => writeLocal(REPEATS_KEY, showRepeats), [showRepeats]);

  const days = mode === "month" ? monthGrid(anchor, weekStart) : weekDays(anchor, weekStart);
  const rows = days.length / 7;

  // Keep the height of a month cell, to know how many chips fit above "+N more".
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => setCellHeight(el.querySelector<HTMLElement>(".cal-day")?.getBoundingClientRect().height ?? 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, rows]);
  const monthLimit = cellHeight ? Math.max(1, Math.min(MONTH_LIMIT, Math.floor((cellHeight - CELL_EXTRA_PX) / CHIP_PX))) : MONTH_LIMIT;
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
    // A drag to another day offers Undo.
    actions.quick(id, patch);
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

  const chip = (item: CalendarItem, key: string, stacked = mode === "month") => (
    <Chip
      key={key}
      item={item}
      stacked={stacked}
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
          <div className="cal-toggles" role="group" aria-label="Show">
            <button className={`tool${showDone ? " on" : ""}`} aria-pressed={showDone} title="Show finished reminders" onClick={() => setShowDone(!showDone)}>
              <Checkmark size={15} />
              Show done
            </button>
            <button
              className={`tool${showRepeats ? " on" : ""}`}
              aria-pressed={showRepeats}
              title="Show every date of repeating reminders, not just a count"
              onClick={() => setShowRepeats(!showRepeats)}
            >
              <Repeat size={15} />
              Show repeats
            </button>
            <button
              className={`tool${noDateOpen ? " on" : ""}`}
              aria-pressed={noDateOpen}
              title="Show reminders with no date beside the calendar"
              onClick={() => setNoDateOpen(!noDateOpen)}
            >
              <PanelOpen size={15} />
              No date
            </button>
          </div>
        </div>
      </header>

      <div className="cal-body">
        <div ref={grid} className={`cal-grid ${mode}`}>
          {weekdayNames.map((name) => (
            <div key={name} className="cal-weekday">
              {name}
            </div>
          ))}
          {days.map((day) => {
            const key = dayKey(day);
            const dayItems = items.get(key) ?? [];
            const { full, repeats } = splitRepeats(dayItems, showRepeats);
            const shown = mode === "month" ? full.slice(0, monthLimit) : full;
            const hidden = full.length - shown.length;
            const outside = mode === "month" && day.getMonth() !== anchor.getMonth();
            return (
              <div
                key={key}
                className={`cal-day${outside ? " outside" : ""}${sameDay(day, now) ? " today" : ""}${dropOn === key ? " drop" : ""}`}
                onClick={(e) => e.target === e.currentTarget && setAdding(key)}
                {...dropHandlers(key, day)}
              >
                <div className="cal-day-head">
                  {repeats.length > 0 && (
                    <span
                      className="cal-repeats"
                      title={`Repeats on this day:\n${repeats.map((r) => r.task.title || "Untitled").join("\n")}`}
                      aria-label={`${repeats.length} repeating ${repeats.length === 1 ? "reminder" : "reminders"} on this day`}
                    >
                      <Repeat size={11} />
                      {repeats.length}
                    </span>
                  )}
                  <span className="cal-date" onClick={() => setAdding(key)}>
                    {day.getDate()}
                  </span>
                </div>
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
                      {dayItems.map((item, i) => chip(item, `pop-${item.task.id}-${i}`, false))}
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
              chip({ task, date: now, faded: false }, `nodate-${task.id}`, false),
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
  stacked,
  list,
  now,
  onToggle,
  onOpen,
}: {
  item: CalendarItem;
  /** Month: the title wraps to two lines with the time under it. */
  stacked: boolean;
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
      className={`cal-chip${stacked ? " stacked" : ""}${faded ? " faded" : ""}${task.completed ? " done" : ""}${overdue ? " overdue" : ""}`}
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
      title={`${task.title || "Untitled"}${time ? `, ${time}` : ""}${faded ? " (repeats)" : ""}`}
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
      {stacked ? (
        <span className="cal-text">
          <span className="cal-title">{task.title || "Untitled"}</span>
          {time && <span className="cal-time">{time}</span>}
        </span>
      ) : (
        <>
          {time && <span className="cal-time">{time}</span>}
          <span className="cal-title">{task.title || "Untitled"}</span>
        </>
      )}
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
