export const LIST_COLORS = [
  "red", "orange", "yellow", "green", "teal", "blue", "indigo", "purple", "pink", "brown", "gray",
] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export const LIST_ICONS = [
  "list", "star", "heart", "home", "work", "cart", "book", "plane", "leaf", "fitness", "gift", "school",
] as const;
export type ListIcon = (typeof LIST_ICONS)[number];

export interface ReminderList {
  id: string;
  name: string;
  color: ListColor;
  icon: ListIcon;
  /** Board columns, in order. Tasks without a section go in the first "Others" column. */
  sections: string[];
}

export type Priority = 0 | 1 | 2 | 3;

export interface Task {
  id: string;
  listId: string;
  title: string;
  notes: string;
  /** ISO timestamp. Date-only reminders use 09:00 local time with `dueHasTime` false. */
  dueAt: string | null;
  dueHasTime: boolean;
  flagged: boolean;
  priority: Priority;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  section: string | null;
}

export interface Settings {
  toggleShortcut: string;
  lockShortcut: string;
  /** Smart list id or list id shown in the floating window. */
  floatView: string;
}

export interface AppData {
  version: 1;
  lists: ReminderList[];
  tasks: Task[];
  settings: Settings;
}

export type SmartId = "today" | "scheduled" | "all" | "flagged" | "completed";

export type View =
  | { kind: "smart"; id: SmartId }
  | { kind: "list"; id: string }
  | { kind: "search"; query: string };

export interface FloatState {
  visible: boolean;
  locked: boolean;
}
