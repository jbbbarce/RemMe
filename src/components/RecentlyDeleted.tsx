import { useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { formatDue } from "../dates";
import { LIST_ICON_COMPONENTS } from "../icons";
import { KEEP_DELETED_DAYS, emptyDeleted, forgetDeleted, restoreDeleted } from "../model";
import type { AppData, DeletedItem } from "../types";

interface Props {
  data: AppData;
  now: Date;
  update(change: (d: AppData) => AppData): void;
}

/** "today, 3:40 pm", "yesterday, 9:02 am" or "Mon 9 Nov". */
function deletedWhen(iso: string, now: Date): string {
  const when = new Date(iso);
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(when.toDateString()).getTime()) / 86_400_000,
  );
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  return when.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Which list a deleted reminder was in, even if that list was deleted too. */
function listName(data: AppData, listId: string): string {
  const live = data.lists.find((l) => l.id === listId);
  if (live) return live.name;
  const gone = data.deleted.find((e) => e.list?.id === listId)?.list;
  return gone ? `${gone.name} (deleted)` : "a deleted list";
}

/** Deleted reminders and lists, newest first, read-only, each with Restore and Delete now. */
export function RecentlyDeleted({ data, now, update }: Props) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const items = data.deleted;

  return (
    <>
      <header className="view-head">
        <h1>Recently deleted</h1>
        <div className="view-sub">
          <span>Kept for {KEEP_DELETED_DAYS} days</span>
          {items.length > 0 && (
            <>
              <span className="dot">·</span>
              <button
                className={`link${confirm === "all" ? " danger-text" : ""}`}
                onClick={() => (confirm === "all" ? (update(emptyDeleted), setConfirm(null)) : setConfirm("all"))}
                onBlur={() => setConfirm((c) => (c === "all" ? null : c))}
              >
                {confirm === "all" ? `Delete ${items.length} forever?` : "Empty Recently Deleted"}
              </button>
            </>
          )}
        </div>
      </header>
      <div className="view-body list">
        {items.length === 0 && <p className="empty">Nothing deleted in the last {KEEP_DELETED_DAYS} days.</p>}
        {items.map((item) => (
          <DeletedRow
            key={item.id}
            item={item}
            data={data}
            now={now}
            confirming={confirm === item.id}
            onRestore={() => update((d) => restoreDeleted(d, item.id))}
            onDelete={() =>
              confirm === item.id ? (update((d) => forgetDeleted(d, item.id)), setConfirm(null)) : setConfirm(item.id)
            }
            onBlurDelete={() => setConfirm((c) => (c === item.id ? null : c))}
          />
        ))}
      </div>
    </>
  );
}

interface RowProps {
  item: DeletedItem;
  data: AppData;
  now: Date;
  confirming: boolean;
  onRestore(): void;
  onDelete(): void;
  onBlurDelete(): void;
}

function DeletedRow({ item, data, now, confirming, onRestore, onDelete, onBlurDelete }: RowProps) {
  const when = deletedWhen(item.deletedAt, now);
  let title: React.ReactNode;
  let meta: string;
  let color: string;
  if (item.list) {
    const Icon = LIST_ICON_COMPONENTS[item.list.icon];
    color = item.list.color;
    title = (
      <span className="deleted-list-title">
        <Icon size={15} style={{ color: `var(--c-${color})` }} />
        {item.list.name}
      </span>
    );
    const n = item.tasks.length;
    meta = `List with ${n} ${n === 1 ? "reminder" : "reminders"} · deleted ${when}`;
  } else {
    const task = item.tasks[0];
    color = data.lists.find((l) => l.id === task.listId)?.color ?? "gray";
    title = task.title || "New Reminder";
    const due = formatDue(task, now);
    meta = [`In ${listName(data, task.listId)}`, due, `deleted ${when}`].filter(Boolean).join(" · ");
  }
  const done = !item.list && item.tasks[0].completed;

  return (
    <div className={`deleted-row${done ? " done" : ""}`} style={{ "--accent": `var(--c-${color})` } as React.CSSProperties}>
      <span className="deleted-mark" />
      <div className="deleted-body">
        <div className="deleted-title">{title}</div>
        <div className="deleted-meta">{meta}</div>
      </div>
      <span className="row-actions">
        <button className="deleted-restore" onClick={onRestore} title="Put it back">
          <ArchiveRestore size={14} />
          Restore
        </button>
        <button
          className={confirming ? "danger deleted-forever" : "icon-btn"}
          aria-label="Delete now"
          title={confirming ? undefined : "Delete now"}
          onClick={onDelete}
          onBlur={onBlurDelete}
        >
          {confirming ? "Delete forever?" : <Trash2 size={15} />}
        </button>
      </span>
    </div>
  );
}
