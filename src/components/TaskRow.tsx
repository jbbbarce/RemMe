import { AlertOff, AlertUrgent, Fire, FlagOn, Info, Repeat, Subtasks, Timer, Window } from "../icons";
import { useEffect, useRef } from "react";
import { REPEAT_LABELS, currentStreak, formatDue, isOverdue } from "../dates";
import { activeSnooze, snoozeLabel } from "../model";
import type { ReminderList, Task } from "../types";

const PRIORITY_NAMES = ["", "Low", "Medium", "High"];

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
  /** Starts a focus session on this reminder. */
  onFocus?(): void;
  /** Enter in the title: create the next reminder. */
  onEnter?(): void;
  /** The title was left empty: remove the reminder. Gets the title it had when it was focused. */
  onEmpty?(titleBefore: string): void;
  /** The title lost focus with text in it. */
  onCommit?(): void;
}

export function TaskRow(props: Props) {
  const { task, list, now, selected, compact } = props;
  const title = useRef<HTMLTextAreaElement>(null);
  const titleOnFocus = useRef(task.title);
  const color = list?.color ?? "blue";

  useEffect(() => {
    if (props.autoFocus) title.current?.focus();
  }, [props.autoFocus]);

  useEffect(() => fitHeight(title.current), [task.title]);

  const due = formatDue(task, now);
  const overdue = isOverdue(task, now);
  const subtasksDone = task.subtasks.filter((s) => s.done).length;
  const streak = currentStreak(task, now);
  const snoozed = activeSnooze(task, now);

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
            onFocus={() => {
              titleOnFocus.current = task.title;
              props.onSelect?.();
            }}
            onBlur={() => {
              if (!task.title.trim()) props.onEmpty?.(titleOnFocus.current);
              else props.onCommit?.();
            }}
          />
        </div>
        {!compact && task.notes && <div className="task-notes">{task.notes}</div>}
        {(task.priority > 0 || due || task.subtasks.length > 0 || task.pomodoros > 0 || task.appTrigger || props.showList || snoozed) && (
          <div className="task-meta">
            {task.priority > 0 && (
              <span className={`prio p${task.priority}`}>{PRIORITY_NAMES[task.priority]}</span>
            )}
            {due && <span className={overdue ? "overdue" : undefined}>{due}</span>}
            {snoozed && (
              <span className="meta-icon snoozed" title="Its popup comes back then; the due time stays">
                <AlertOff size={11} />
                {snoozeLabel(snoozed, now)}
              </span>
            )}
            {task.repeat && (
              <span className="meta-icon" title={`Repeats ${REPEAT_LABELS[task.repeat].toLowerCase()}`}>
                <Repeat size={11} />
              </span>
            )}
            {streak > 0 && (
              <span className="meta-icon streak" title={`Done on time ${streak} ${streak === 1 ? "time" : "times"} in a row`}>
                <Fire size={11} />
                {streak}
              </span>
            )}
            {task.nagMinutes && task.dueAt && !task.completed && (
              <span className="meta-icon" title={`Nags every ${task.nagMinutes} minutes until done`}>
                <AlertUrgent size={11} />
              </span>
            )}
            {task.appTrigger && (
              <span className="meta-icon" title={`Reminds you when ${task.appTrigger} opens`}>
                <Window size={11} />
                {task.appTrigger}
              </span>
            )}
            {task.pomodoros > 0 && (
              <span className="meta-icon pomodoros" title={`${task.pomodoros} focus ${task.pomodoros === 1 ? "session" : "sessions"} done`}>
                <Timer size={12} />
                {task.pomodoros}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="meta-icon" title="Subtasks done">
                <Subtasks size={12} />
                {subtasksDone}/{task.subtasks.length}
              </span>
            )}
            {props.showList && list && <span className="meta-list">{list.name}</span>}
          </div>
        )}
      </div>
      {task.flagged && <FlagOn className="flag-mark" size={14} />}
      {props.onFocus && !task.completed && (
        <button
          className="icon-btn info-btn"
          aria-label="Focus on this"
          title="Focus on this"
          onClick={(e) => {
            e.stopPropagation();
            props.onFocus?.();
          }}
        >
          <Timer size={16} />
        </button>
      )}
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
