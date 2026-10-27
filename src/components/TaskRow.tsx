import { useEffect, useRef } from "react";
import { Flag, Info } from "lucide-react";
import { formatDue, isOverdue } from "../dates";
import type { ReminderList, Task } from "../types";

interface Props {
  task: Task;
  list: ReminderList | undefined;
  now: Date;
  selected?: boolean;
  autoFocus?: boolean;
  /** Shows the list name under the title (smart lists and search). */
  showList?: boolean;
  compact?: boolean;
  onToggle(completed: boolean): void;
  onChange(patch: Partial<Task>): void;
  onSelect?(): void;
  /** Opens the details panel. */
  onInfo?(): void;
  /** Enter in the title: create the next reminder. */
  onEnter?(): void;
  /** The title was left empty: remove the reminder. */
  onEmpty?(): void;
}

export function TaskRow(props: Props) {
  const { task, list, now, selected, compact } = props;
  const title = useRef<HTMLTextAreaElement>(null);
  const color = list?.color ?? "blue";

  useEffect(() => {
    if (props.autoFocus) title.current?.focus();
  }, [props.autoFocus]);

  useEffect(() => fitHeight(title.current), [task.title]);

  const due = formatDue(task, now);
  const overdue = isOverdue(task, now);
  const marks = "!".repeat(task.priority);

  return (
    <div
      className={`task-row${task.completed ? " done" : ""}${selected ? " selected" : ""}${compact ? " compact" : ""}`}
      onClick={props.onSelect}
    >
      <button
        className="check"
        style={{ "--accent": `var(--c-${color})` } as React.CSSProperties}
        aria-label={task.completed ? "Mark as not completed" : "Mark as completed"}
        onClick={(e) => {
          e.stopPropagation();
          props.onToggle(!task.completed);
        }}
      >
        <span />
      </button>
      <div className="task-body">
        <div className="task-title-line">
          {marks && <span className="priority" style={{ color: `var(--c-${color})` }}>{marks}</span>}
          <textarea
            ref={title}
            className="task-title"
            rows={1}
            value={task.title}
            placeholder="New Reminder"
            spellCheck={false}
            onChange={(e) => props.onChange({ title: e.target.value.replace(/\n/g, "") })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (task.title.trim()) props.onEnter?.();
                else e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            onFocus={props.onSelect}
            onBlur={() => {
              if (!task.title.trim()) props.onEmpty?.();
            }}
          />
        </div>
        {!compact && task.notes && <div className="task-notes">{task.notes}</div>}
        {(due || props.showList) && (
          <div className="task-meta">
            {due && <span className={overdue ? "overdue" : undefined}>{due}</span>}
            {props.showList && list && <span className="meta-list">{list.name}</span>}
          </div>
        )}
      </div>
      {task.flagged && <Flag className="flag-mark" size={14} fill="currentColor" />}
      {props.onInfo && (
        <button
          className="icon-btn info-btn"
          aria-label="Details"
          onClick={(e) => {
            e.stopPropagation();
            props.onInfo?.();
          }}
        >
          <Info size={16} />
        </button>
      )}
    </div>
  );
}

function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
