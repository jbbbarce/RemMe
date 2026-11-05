import { CirclePlus, Search, X } from "lucide-react";
import { LIST_ICON_COMPONENTS, SMART_ICONS } from "../icons";
import { SMART_LISTS, smartCount } from "../model";
import type { AppData, ReminderList, View } from "../types";
import { PomodoroPanel } from "./Pomodoro";

interface Props {
  data: AppData;
  view: View;
  now: Date;
  search: string;
  onSearch(query: string): void;
  onView(view: View): void;
  onAddList(): void;
  onEditList(list: ReminderList): void;
}

export function Sidebar({ data, view, now, search, onSearch, onView, onAddList, onEditList }: Props) {
  const openCount = (listId: string) => data.tasks.filter((t) => t.listId === listId && !t.completed).length;

  return (
    <aside className="sidebar">
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
            <X size={14} />
          </button>
        )}
      </label>

      <nav className="lists" aria-label="Smart lists">
        {SMART_LISTS.map((smart) => {
          const Icon = SMART_ICONS[smart.id];
          const active = view.kind === "smart" && view.id === smart.id;
          return (
            <button
              key={smart.id}
              className={`nav-item${active ? " active" : ""}`}
              onClick={() => onView({ kind: "smart", id: smart.id })}
            >
              <span className="nav-icon">
                <Icon size={15} />
              </span>
              <span className="nav-name">{smart.name}</span>
              {smart.id !== "completed" && smart.id !== "calendar" && (
                <span className="nav-count">{smartCount(data, smart.id, now)}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="section-label">Lists</div>
      <nav className="lists" aria-label="Your lists">
        {data.lists.map((list) => {
          const active = view.kind === "list" && view.id === list.id;
          const Icon = LIST_ICON_COMPONENTS[list.icon];
          return (
            <button
              key={list.id}
              className={`nav-item${active ? " active" : ""}`}
              onClick={() => onView({ kind: "list", id: list.id })}
              onDoubleClick={() => onEditList(list)}
              onContextMenu={(e) => {
                e.preventDefault();
                onEditList(list);
              }}
              title="Double-click or right-click to edit"
            >
              <span className="nav-icon" style={{ color: `var(--c-${list.color})` }}>
                <Icon size={15} />
              </span>
              <span className="nav-name">{list.name}</span>
              <span className="nav-count">{openCount(list.id)}</span>
            </button>
          );
        })}
      </nav>

      <PomodoroPanel data={data} />

      <button className="add-list" onClick={onAddList}>
        <CirclePlus size={15} />
        Add list
      </button>
    </aside>
  );
}
