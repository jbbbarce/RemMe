import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayKey, itemsByDay, monthGrid, sameDay, shiftAnchor, weekStartDay } from "../calendar";
import type { AppData } from "../types";
import { TaskRow } from "./TaskRow";
import type { useTaskActions } from "./useTaskActions";

interface Props {
  data: AppData;
  now: Date;
  actions: ReturnType<typeof useTaskActions>;
}

/** The floating list's calendar: a small month with dots on busy days, and the chosen day's reminders. */
export function MiniCalendar({ data, now, actions }: Props) {
  const weekStart = useMemo(() => weekStartDay(), []);
  const [anchor, setAnchor] = useState(() => now);
  const [selected, setSelected] = useState(() => now);
  const days = monthGrid(anchor, weekStart);
  const items = itemsByDay(data.tasks, days[0], days[days.length - 1], false);
  const chosen = itemsByDay(data.tasks, selected, selected, false).get(dayKey(selected)) ?? [];

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <button className="icon-btn" aria-label="Previous month" onClick={() => setAnchor((a) => shiftAnchor(a, "month", -1))}>
          <ChevronLeft size={14} />
        </button>
        <button
          className="mini-cal-title"
          title="Go to today"
          onClick={() => {
            setAnchor(new Date());
            setSelected(new Date());
          }}
        >
          {anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </button>
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
        {days.map((day) => {
          const busy = (items.get(dayKey(day)) ?? []).length > 0;
          return (
            <button
              key={dayKey(day)}
              className={`mini-cal-day${day.getMonth() !== anchor.getMonth() ? " outside" : ""}${sameDay(day, now) ? " today" : ""}${sameDay(day, selected) ? " on" : ""}`}
              aria-label={`${day.toLocaleDateString(undefined, { dateStyle: "full" })}${busy ? ", has reminders" : ""}`}
              aria-pressed={sameDay(day, selected)}
              onClick={() => setSelected(day)}
            >
              {day.getDate()}
              {busy && <i className="mini-cal-dot" />}
            </button>
          );
        })}
      </div>
      <div className="mini-cal-list">
        {chosen.length === 0 && <p className="empty">Nothing on this day</p>}
        {chosen.map(({ task, faded }, i) =>
          faded ? (
            <div key={`${task.id}-${i}`} className="mini-cal-faded" title="A later date of a repeating reminder">
              {task.title || "Untitled"}
            </div>
          ) : (
            <TaskRow
              key={task.id}
              task={task}
              list={data.lists.find((l) => l.id === task.listId)}
              now={now}
              compact
              onToggle={(done) => actions.toggle(task, done)}
              onChange={(patch) => actions.change(task.id, patch)}
              onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
            />
          ),
        )}
      </div>
    </div>
  );
}
