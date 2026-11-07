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

export const REPEATS = ["daily", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

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
  /** Checking off a repeating reminder adds the next one. Needs a due date. */
  repeat: Repeat | null;
  subtasks: Subtask[];
  /** While due and unfinished, notify again every this many minutes. */
  nagMinutes: number | null;
  /** For repeating reminders: how many times in a row the earlier ones were done by their due day. */
  streak: number;
  /** An app such as "chrome.exe": opening it notifies about this reminder while it is unfinished. */
  appTrigger: string | null;
  /** On a done repeating reminder: the id of the next one checking it off added. */
  nextId: string | null;
  /** Focus sessions finished on this reminder. */
  pomodoros: number;
}

export const THEMES = ["pro", "calm", "paper", "fluent"] as const;
export type ThemeId = (typeof THEMES)[number];

export interface Settings {
  toggleShortcut: string;
  lockShortcut: string;
  /** Smart list id or list id shown in the floating window. */
  floatView: string;
  theme: ThemeId;
  pomodoroShortcut: string;
  /** Session lengths in minutes. */
  pomodoroFocus: number;
  pomodoroShort: number;
  pomodoroLong: number;
  pomodoroChime: boolean;
  /** Shows the verse of the day in the sidebar and the floating list. */
  verseOfDay: boolean;
}

export type TimerPhase = "idle" | "focus" | "shortBreak" | "longBreak";

/** The Pomodoro timer as the backend reports it. Times are Unix milliseconds. */
export interface TimerState {
  phase: TimerPhase;
  running: boolean;
  endsAt: number | null;
  /** Time left while paused. */
  remaining: number;
  total: number;
  taskId: string | null;
  /** Focus sessions finished in the current set of four. */
  inSet: number;
  /** Focus sessions finished today. */
  today: number;
  day: string;
}

/** A timer phase that just ended. */
export interface TimerFinished {
  phase: TimerPhase;
  next: TimerPhase;
  taskId: string | null;
  counted: boolean;
}

export interface AppData {
  version: 1;
  lists: ReminderList[];
  tasks: Task[];
  settings: Settings;
}

export type SmartId = "today" | "scheduled" | "all" | "flagged" | "completed" | "calendar";

export type View =
  | { kind: "smart"; id: SmartId }
  | { kind: "list"; id: string }
  | { kind: "search"; query: string };

export interface FloatState {
  visible: boolean;
  locked: boolean;
}
