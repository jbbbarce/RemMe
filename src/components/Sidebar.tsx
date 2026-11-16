import { Fragment } from "react";
import { Add, Delete, Dismiss, LIST_ICON_COMPONENTS, More, SMART_ICONS, Search } from "../icons";
import { SMART_LISTS, smartCount } from "../model";
import type { AppData, ReminderList, View } from "../types";
import { PomodoroPanel } from "./Pomodoro";
import { Menu, Tip } from "./ui";
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
            <button
              className={`nav-item${active ? " active" : ""}`}
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
            <div className="nav-row" key={list.id}>
              <button
                className={`nav-item${active ? " active" : ""}`}
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
      <button className={`nav-item${view.kind === "deleted" ? " active" : ""}`} onClick={() => onView({ kind: "deleted" })}>
        <span className="nav-icon">
          <Delete size={18} />
        </span>
        <span className="nav-name">Recently deleted</span>
        {data.deleted.length > 0 && <span className="nav-count">{data.deleted.length}</span>}
      </button>

      {data.settings.verseOfDay && <VerseCard now={now} />}
      <PomodoroPanel data={data} />
    </aside>
  );
}
