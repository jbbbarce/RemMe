import { CirclePlus, Search, X } from "lucide-react";
import { ListBadge, SMART_ICONS } from "../icons";
import { SMART_LISTS, smartCount } from "../model";
import type { AppData, ReminderList, View } from "../types";

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

      <div className="tiles">
        {SMART_LISTS.map((smart) => {
          const Icon = SMART_ICONS[smart.id];
          const active = view.kind === "smart" && view.id === smart.id;
          return (
            <button
              key={smart.id}
              className={`tile${active ? " active" : ""}${smart.id === "completed" ? " wide" : ""}`}
              style={{ "--tile": `var(--c-${smart.color})` } as React.CSSProperties}
              onClick={() => onView({ kind: "smart", id: smart.id })}
            >
              <span className="tile-icon">
                <Icon size={15} strokeWidth={2.6} />
              </span>
              <span className="tile-count">{smart.id === "completed" ? "" : smartCount(data, smart.id, now)}</span>
              <span className="tile-name">{smart.name}</span>
            </button>
          );
        })}
      </div>

      <div className="section-label">My Lists</div>
      <nav className="lists">
        {data.lists.map((list) => {
          const active = view.kind === "list" && view.id === list.id;
          return (
            <button
              key={list.id}
              className={`list-item${active ? " active" : ""}`}
              onClick={() => onView({ kind: "list", id: list.id })}
              onDoubleClick={() => onEditList(list)}
              onContextMenu={(e) => {
                e.preventDefault();
                onEditList(list);
              }}
              title="Double-click or right-click to edit"
            >
              <ListBadge icon={list.icon} color={list.color} />
              <span className="list-name">{list.name}</span>
              <span className="list-count">{openCount(list.id)}</span>
            </button>
          );
        })}
      </nav>

      <button className="add-list" onClick={onAddList}>
        <CirclePlus size={18} />
        Add List
      </button>
    </aside>
  );
}
