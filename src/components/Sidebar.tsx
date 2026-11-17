import { Fragment, useState } from "react";
import { Add, Delete, Dismiss, LIST_ICON_COMPONENTS, More, SMART_ICONS, Search } from "../icons";
import { SMART_LISTS, smartCount } from "../model";
import type { AppData, ReminderList, View } from "../types";
import { PomodoroPanel, PomodoroRailButton } from "./Pomodoro";
import { Menu, Tip } from "./ui";
import { TASK_DRAG, carriesTask } from "./useRowDrag";
import { VerseCard } from "./Verse";

interface Props {
  data: AppData;
  view: View;
  now: Date;
  search: string;
  onSearch(query: string): void;
  onView(view: View): void;
  onAddList(): void;
  onEditList(list: ReminderList): void;
  /** A reminder was dropped on a list. */
  onDropTask(listId: string, taskId: string): void;
  /** Icons only, with names in tooltips: for narrow windows. */
  rail: boolean;
  /** The rail's search button: widen the sidebar and type in search. */
  onOpenSearch(): void;
}

/** In the rail, names move into tooltips. */
function Named({ rail, name, children }: { rail: boolean; name: string; children: React.ReactElement }) {
  return rail ? (
    <Tip text={name} side="right">
      {children}
    </Tip>
  ) : (
    children
  );
}

export function Sidebar(props: Props) {
  const { data, view, now, search, onSearch, onView, onAddList, onEditList, onDropTask, rail, onOpenSearch } = props;
  const [dropOn, setDropOn] = useState<string | null>(null);
  const openCount = (listId: string) => data.tasks.filter((t) => t.listId === listId && !t.completed).length;

  return (
    <aside className={`sidebar${rail ? " rail" : ""}`}>
      <Tip text="Search" side="right">
        <button className="icon-btn rail-search" aria-label="Search" onClick={onOpenSearch}>
          <Search size={18} />
        </button>
      </Tip>
      <label className="search">
        <Search size={15} />
        <input
          value={search}
          placeholder="Search"
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onSearch("")}
        />
        {search && (
          <button className="icon-btn" aria-label="Clear search" onClick={() => onSearch("")}>
            <Dismiss size={14} />
          </button>
        )}
      </label>

      <nav className="lists" aria-label="Smart lists">
        {SMART_LISTS.map((smart) => {
          const Icon = SMART_ICONS[smart.id];
          const active = view.kind === "smart" && view.id === smart.id;
          return (
            <Fragment key={smart.id}>
            {smart.id === "calendar" && <div className="side-sep" />}
            <Named rail={rail} name={smart.name}>
            <button
              className={`nav-item${active ? " active" : ""}`}
              aria-label={rail ? smart.name : undefined}
              onClick={() => onView({ kind: "smart", id: smart.id })}
            >
              <span className="nav-icon">
                <Icon size={18} />
              </span>
              <span className="nav-name">{smart.name}</span>
              {smart.id !== "completed" && smart.id !== "calendar" && smartCount(data, smart.id, now) > 0 && (
                <span className="nav-count">{smartCount(data, smart.id, now)}</span>
              )}
            </button>
            </Named>
            </Fragment>
          );
        })}
      </nav>

      <div className="side-head">
        <span>Lists</span>
        <Tip text="Add list">
          <button className="icon-btn" aria-label="Add list" onClick={onAddList}>
            <Add size={16} />
          </button>
        </Tip>
      </div>
      <nav className="lists" aria-label="Your lists">
        {data.lists.map((list) => {
          const active = view.kind === "list" && view.id === list.id;
          const Icon = LIST_ICON_COMPONENTS[list.icon];
          return (
            <div
              className={`nav-row${dropOn === list.id ? " drop" : ""}`}
              key={list.id}
              onDragOver={(e) => {
                if (!carriesTask(e)) return;
                e.preventDefault();
                setDropOn(list.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOn((d) => (d === list.id ? null : d));
              }}
              onDrop={(e) => {
                if (!carriesTask(e)) return;
                e.preventDefault();
                setDropOn(null);
                const id = e.dataTransfer.getData(TASK_DRAG);
                if (id) onDropTask(list.id, id);
              }}
            >
              <Named rail={rail} name={list.name}>
              <button
                className={`nav-item${active ? " active" : ""}`}
                aria-label={rail ? list.name : undefined}
                onClick={() => onView({ kind: "list", id: list.id })}
                onDoubleClick={() => onEditList(list)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onEditList(list);
                }}
              >
                <span className="nav-icon" style={{ color: `var(--c-${list.color})` }}>
                  <Icon size={18} />
                </span>
                <span className="nav-name">{list.name}</span>
                {openCount(list.id) > 0 && <span className="nav-count">{openCount(list.id)}</span>}
              </button>
              </Named>
              <Menu
                align="end"
                trigger={
                  <button className="icon-btn nav-more" aria-label={`More for ${list.name}`}>
                    <More size={16} />
                  </button>
                }
                items={[{ label: "Edit list…", onSelect: () => onEditList(list) }]}
              />
            </div>
          );
        })}
      </nav>

      <div className="side-sep" />
      <Named rail={rail} name="Recently deleted">
      <button
        className={`nav-item${view.kind === "deleted" ? " active" : ""}`}
        aria-label={rail ? "Recently deleted" : undefined}
        onClick={() => onView({ kind: "deleted" })}
      >
        <span className="nav-icon">
          <Delete size={18} />
        </span>
        <span className="nav-name">Recently deleted</span>
        {data.deleted.length > 0 && <span className="nav-count">{data.deleted.length}</span>}
      </button>
      </Named>

      {/* The verse and the timer sit at the bottom as one-line bars; the rail keeps only the timer's ring. */}
      <div className="side-bottom">
        {!rail && data.settings.verseOfDay && <VerseCard now={now} />}
        {rail ? <PomodoroRailButton data={data} /> : <PomodoroPanel data={data} />}
      </div>
    </aside>
  );
}
