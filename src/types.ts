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
  /** Board columns, in order. Tasks without a section go in the first "No section" column. */
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
  /** ISO time a snoozed popup comes back. The due time stays as it is. */
  snoozedUntil: string | null;
}

export const THEMES = ["pro", "calm", "paper", "fluent"] as const;
export type ThemeId = (typeof THEMES)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

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
  /** How opaque the floating list is, in percent (40 to 100). Locked, it is a little fainter still. */
  floatOpacity: number;
  /** How tightly rows are packed in the main window. The floating list is always compact. */
  density: Density;
  /** Due-reminder popups stay on screen until Snooze, Done or ✕ is pressed. */
  stickyReminders: boolean;
  /** Coach: notices when you're off track during focus time. Off by default. */
  coach: CoachSettings;
}

/** A stretch of focus hours on one weekday, as local "HH:mm" times. */
export interface FocusRange {
  start: string;
  end: string;
}

/** An app (a process name such as "steam.exe") or a site (a word in a browser's window title). */
export interface Distraction {
  kind: "app" | "site";
  match: string;
}

export interface CoachSettings {
  enabled: boolean;
  /** Seven days, Sunday first (as `Date.getDay()`), each with up to 3 ranges. */
  focusHours: FocusRange[][];
  /** Also watch whenever a reminder is overdue, outside focus hours. */
  alsoWhenOverdue: boolean;
  distractions: Distraction[];
  /** Minutes without input before you count as idle. */
  idleMinutes: number;
  /** Minutes off track without a stop before the Nudge, and before the Push. */
  nudgeAfter: number;
  pushAfter: number;
  /** Minutes back on track in a row that reset the ladder. */
  resetAfter: number;
  realTalk: boolean;
  /** Minutes off track in total, in one focus block, before real talk. */
  realTalkAfter: number;
  /** Coach's last step: a dimmed overlay that clears only when you choose what to do next. */
  takeover: boolean;
  /** Minutes off track without a stop before the Takeover; always after the Push. */
  takeoverAfter: number;
  /** Your own real-talk lines, added to the built-in ones. */
  realTalkLines: string[];
  /** Coach speaks the Push aloud, in a natural voice that runs on this PC. */
  speak: boolean;
  /** Kokoro's name for the voice, such as "af_heart". */
  voice: string;
  /** A different voice for real talk, or null for the same one. */
  realTalkVoice: string | null;
  /** 0.8 to 1.3. */
  voiceSpeed: number;
  /** Percent, 0 to 100. */
  voiceVolume: number;
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

/** A button or click on a reminder popup, sent by the backend to the main window. */
export interface PopupAction {
  action: "snooze" | "done" | "open" | "today";
  taskId: string | null;
  minutes: number | null;
}

/** A timer phase that just ended. */
export interface TimerFinished {
  phase: TimerPhase;
  next: TimerPhase;
  taskId: string | null;
  counted: boolean;
}

/**
 * Something in Recently deleted: one reminder, or a list with the reminders deleted with it.
 * Entries deleted by one action share a `batch`, which Undo puts back together.
 */
export interface DeletedItem {
  id: string;
  batch: string;
  deletedAt: string;
  /** Set for a deleted list. */
  list: ReminderList | null;
  /** Where the list was in the sidebar. */
  listIndex: number;
  tasks: Task[];
  /** Where each reminder was in `AppData.tasks`, for Undo. */
  taskIndexes: number[];
}

export interface AppData {
  version: 1;
  lists: ReminderList[];
  tasks: Task[];
  settings: Settings;
  /** Recently deleted, newest first. */
  deleted: DeletedItem[];
}

export type SmartId = "today" | "scheduled" | "all" | "flagged" | "completed" | "calendar";

export type View =
  | { kind: "smart"; id: SmartId }
  | { kind: "list"; id: string }
  | { kind: "search"; query: string }
  | { kind: "deleted" };

export interface FloatState {
  visible: boolean;
  locked: boolean;
}
