import { useState, type ReactElement } from "react";
import { ContextMenu, Popover } from "radix-ui";
import {
  DAY_PRESETS,
  DAY_PRESET_LABELS,
  NO_DUE,
  SNOOZE_PRESETS,
  TIME_PRESETS,
  canSnooze,
  dueAtTime,
  dueOnDay,
  fromInputs,
  presetDay,
  shortDay,
  snoozeUntil,
  timeLabel,
  toDateInput,
  toTimeInput,
} from "../dates";
import { AlertOff, Checkmark, Delete, Flag, Info, Timer } from "../icons";
import { activeSnooze } from "../model";
import { PRIORITY_NAMES } from "../quickAdd";
import type { Priority, ReminderList, Task } from "../types";
import { Menu } from "./ui";

/**
 * Quick edits on a reminder without opening its details: a right-click menu, a date picker on
 * the row's date, and a menu on its priority chip. All of them change the reminder through
 * `onChange`, the same way the details panel does.
 */

interface MenuProps {
  task: Task;
  lists: ReminderList[];
  now: Date;
  onChange(patch: Partial<Task>): void;
  onDelete(): void;
  onInfo?(): void;
  onFocus?(): void;
  /** Several reminders are selected and the menu changes all of them. */
  count?: number;
  children: ReactElement;
}

const PRIORITIES: Priority[] = [0, 1, 2, 3];

/** The right-click menu on a reminder row. Right-clicking inside a title being edited keeps the text menu. */
export function TaskContextMenu({ task, lists, now, onChange, onDelete, onInfo, onFocus, count, children }: MenuProps) {
  const many = !!count && count > 1;
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu" collisionPadding={6}>
          {many && (
            <>
              <ContextMenu.Label className="menu-label menu-count">{count} reminders selected</ContextMenu.Label>
              <ContextMenu.Separator className="menu-sep" />
            </>
          )}
          <ContextMenu.Label className="menu-label">Date</ContextMenu.Label>
          {DAY_PRESETS.map((p) => (
            <ContextMenu.Item key={p} className="menu-item" onSelect={() => onChange(dueOnDay(task, presetDay(p, now)))}>
              {DAY_PRESET_LABELS[p]}
              <span className="menu-hint">{shortDay(presetDay(p, now))}</span>
            </ContextMenu.Item>
          ))}
          {(task.dueAt || many) && (
            <ContextMenu.Item className="menu-item" onSelect={() => onChange(NO_DUE)}>
              No date
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="menu-sep" />

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="menu-item">
              Priority
              <span className="menu-hint">{PRIORITY_NAMES[task.priority] || "None"}</span>
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="menu" sideOffset={2} collisionPadding={6}>
                <ContextMenu.RadioGroup value={String(task.priority)} onValueChange={(v) => onChange({ priority: Number(v) as Priority })}>
                  {PRIORITIES.map((p) => (
                    <ContextMenu.RadioItem key={p} value={String(p)} className="menu-item">
                      {PRIORITY_NAMES[p] || "None"}
                      <ContextMenu.ItemIndicator className="menu-check">
                        <Checkmark size={14} />
                      </ContextMenu.ItemIndicator>
                    </ContextMenu.RadioItem>
                  ))}
                </ContextMenu.RadioGroup>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>

          {lists.length > 1 && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="menu-item">
                Move to
                <span className="menu-hint">{lists.find((l) => l.id === task.listId)?.name}</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="menu" sideOffset={2} collisionPadding={6}>
                  <ContextMenu.RadioGroup value={task.listId} onValueChange={(listId) => onChange({ listId, section: null })}>
                    {lists.map((l) => (
                      <ContextMenu.RadioItem key={l.id} value={l.id} className="menu-item">
                        <span className="menu-dot" style={{ background: `var(--c-${l.color})` }} />
                        {l.name}
                        <ContextMenu.ItemIndicator className="menu-check">
                          <Checkmark size={14} />
                        </ContextMenu.ItemIndicator>
                      </ContextMenu.RadioItem>
                    ))}
                  </ContextMenu.RadioGroup>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}

          <ContextMenu.Item className="menu-item" onSelect={() => onChange({ flagged: !task.flagged })}>
            <Flag size={16} />
            {task.flagged ? "Remove flag" : "Flag"}
          </ContextMenu.Item>
          {canSnooze(task, now) && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="menu-item">
                <AlertOff size={16} />
                Snooze
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="menu" sideOffset={2} collisionPadding={6}>
                  <ContextMenu.Label className="menu-label">Popup comes back in</ContextMenu.Label>
                  {SNOOZE_PRESETS.map((p) => (
                    <ContextMenu.Item
                      key={p.label}
                      className="menu-item"
                      // The time is read when chosen, not when the menu opened.
                      onSelect={() => onChange({ snoozedUntil: snoozeUntil(p.minutes, new Date()).toISOString() })}
                    >
                      {p.label}
                    </ContextMenu.Item>
                  ))}
                  {(activeSnooze(task, now) || many) && (
                    <>
                      <ContextMenu.Separator className="menu-sep" />
                      <ContextMenu.Item className="menu-item" onSelect={() => onChange({ snoozedUntil: null })}>
                        Stop snoozing
                      </ContextMenu.Item>
                    </>
                  )}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}
          {onFocus && !task.completed && !many && (
            <ContextMenu.Item className="menu-item" onSelect={onFocus}>
              <Timer size={16} />
              Focus on this
            </ContextMenu.Item>
          )}
          {onInfo && !many && (
            <ContextMenu.Item className="menu-item" onSelect={onInfo}>
              <Info size={16} />
              Details
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="menu-sep" />
          <ContextMenu.Item className="menu-item danger-item" onSelect={onDelete}>
            <Delete size={16} />
            {many ? `Delete ${count} reminders` : "Delete"}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

interface DueProps {
  task: Task;
  now: Date;
  label: string;
  overdue: boolean;
  onChange(patch: Partial<Task>): void;
}

/** The date on a reminder row, as a button that opens quick date and time choices. */
export function DuePicker({ task, now, label, overdue, onChange }: DueProps) {
  const [open, setOpen] = useState(false);
  const day = task.dueAt ? toDateInput(task.dueAt) : "";
  const time = task.dueAt && task.dueHasTime ? toTimeInput(task.dueAt) : "";
  const set = (patch: Partial<Task>, close = false) => {
    onChange(patch);
    if (close) setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={`due-btn${overdue ? " overdue" : ""}`}
          aria-label={`Due ${label}. Change date`}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu due-pop" side="bottom" align="start" sideOffset={4} collisionPadding={6}>
          <div className="due-pop-section">
            <span className="menu-label">Date</span>
            <div className="due-chips">
              {DAY_PRESETS.map((p) => {
                const d = presetDay(p, now);
                return (
                  <button
                    key={p}
                    className="btn"
                    aria-pressed={day === toDateInput(d.toISOString())}
                    title={shortDay(d)}
                    onClick={() => set(dueOnDay(task, d), true)}
                  >
                    {DAY_PRESET_LABELS[p]}
                  </button>
                );
              })}
            </div>
            <label className="due-field">
              <input
                type="date"
                className="field"
                aria-label="Date"
                value={day}
                onChange={(e) => e.target.value && set({ dueAt: fromInputs(e.target.value, time || "09:00"), dueHasTime: !!time })}
              />
            </label>
          </div>
          <div className="due-pop-section">
            <span className="menu-label">Time</span>
            <div className="due-chips">
              <button className="btn" aria-pressed={!time} onClick={() => set(dueAtTime(task, null, now))}>
                No time
              </button>
              {TIME_PRESETS.map((t) => (
                <button key={t} className="btn" aria-pressed={time === t} onClick={() => set(dueAtTime(task, t, now), true)}>
                  {t === "12:00" ? "Noon" : timeLabel(t)}
                </button>
              ))}
            </div>
            <input
              type="time"
              className="field"
              aria-label="Time"
              value={time}
              onChange={(e) => e.target.value && set(dueAtTime(task, e.target.value, now))}
            />
          </div>
          <button className="btn subtle danger-text due-remove" onClick={() => set(NO_DUE, true)}>
            Remove date
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The priority chip on a reminder row, as a button that opens a menu to change it. */
export function PriorityPicker({ task, onChange }: { task: Task; onChange(patch: Partial<Task>): void }) {
  return (
    <Menu
      trigger={
        <button
          className={`prio p${task.priority}`}
          aria-label={`${PRIORITY_NAMES[task.priority]} priority. Change priority`}
          onClick={(e) => e.stopPropagation()}
        >
          {PRIORITY_NAMES[task.priority]}
        </button>
      }
      items={PRIORITIES.map((p) => ({
        label: PRIORITY_NAMES[p] || "None",
        checked: p === task.priority,
        onSelect: () => onChange({ priority: p }),
      }))}
    />
  );
}
