# How RemMe is built

The developer side of RemMe: the stack, how the pieces fit, and where each feature lives in the code. For what the features do, see [FEATURES.md](FEATURES.md).

## Contents

- [History](#history)
- [Stack](#stack)
- [Two windows, one data file](#two-windows-one-data-file)
- [The Rust backend](#the-rust-backend)
- [The React front end](#the-react-front-end)
- [The data model](#the-data-model)
- [Shared mechanisms](#shared-mechanisms)
- [Where each feature lives](#where-each-feature-lives)
- [Tests](#tests)
- [Building and releasing](#building-and-releasing)
- [How work is done in this repo](#how-work-is-done-in-this-repo)

## History

- **26 Oct 2026:** a .NET WPF app (C#) of always-on-top sticky notes, with an xUnit test project. It was built in 9 steps; see the git history before commit `0ddbfac`.
- **First run:** a missing data file means a new install; `load_or_recover` then returns `first_run_data` (the usual list plus Getting started). A damaged file with no backup still starts empty. The old `com.reminders.app` folder is copied first if it exists, so upgraders never get the examples.
- **27 Oct 2026, `0ddbfac`:** rewritten as a Tauri 2 + React + TypeScript app, keeping only the ideas (a floating window, tray, reminders, start with Windows). The WPF code was removed.
- **4 Nov 2026:** renamed from Reminders to RemMe. The app id changed from `com.reminders.app` to `com.remme.app`, and the first start copies data from the old folder (`copy_old_data` in `lib.rs`).

[PLAN.md](../PLAN.md) lists the 25 steps since the rewrite.

## Stack

| Part | Choice |
|---|---|
| Desktop shell | Tauri 2 (Rust, WebView2 on Windows) |
| UI | React 19, TypeScript 6, Vite 8 |
| UI primitives | Radix (`radix-ui`): Dialog, Select, DropdownMenu, ContextMenu, Popover, Tooltip |
| Icons | `@fluentui/react-icons`, wrapped in `src/icons.tsx` |
| Fonts | Segoe UI (Windows), Fraunces for Paper and ink headings (`@fontsource/fraunces`) |
| Tauri plugins | autostart, global-shortcut, notification, single-instance, window-state, updater, process, dialog |
| Other Rust crates | `serde_json`, `chrono`, `windows` (Win32 and WinRT calls), `sysinfo` (running apps), `tauri-winrt-notification` (popups with buttons) |
| Tests | Vitest (TypeScript), `cargo test` (Rust) |
| Package manager | pnpm |
| CI | GitHub Actions `release.yml` with `tauri-action`; Dependabot for the actions |

## Two windows, one data file

Tauri creates two windows, defined in `src-tauri/tauri.conf.json`:

- `main`: the main window.
- `float`: the floating list, always on top. Both start hidden and transparent (for Mica and Acrylic).

Both load the same React bundle. `src/App.tsx` reads the window's label and renders `MainApp` or `FloatApp`, adding the `is-float` class to `<html>` for the floating window.

```
            reminders.json  (%APPDATA%\com.remme.app)
                 ^   |
     save_data   |   |  load_data
                 |   v
   +---------- Rust backend (lib.rs) ----------+
   |  emits "data-changed" to both windows     |
   +-------------------------------------------+
        |   ^                         |   ^
        v   |                         v   |
   main window (MainApp)        float window (FloatApp)
   useAppData(): data + update  useAppData(): data + update
```

- `src/store.ts` `useAppData()` loads the data with `load_data` (retrying while the webview starts) and passes it through `normalize`.
- `update(change)` applies a change to the in-memory data at once and saves it 250 ms later with `save_data`.
- The backend writes the file atomically and emits `data-changed` with the source window's label. The other window replaces its data. The window that saved ignores its own echo, and a window with an unsaved edit of its own keeps that edit.
- `ui-state.json` holds backend-only state:
  - the floating window's visibility and lock
  - which reminders already notified, and when each nagging one last did
  - today's focus-session count
  - the second backup folder and its last error

## The Rust backend

Everything is in `src-tauri/src/`:

- `lib.rs`: the app (commands, tray, shortcuts, notifications, windows).
- `backup.rs`: backup file names, listing, pruning and recovery.
- `pomodoro.rs`: the timer's state machine.

**Background threads**

- **Due checks** every 15 seconds: `check_reminders` reads due tasks from the data (`due_tasks`), decides with `should_notify` (nag interval, snooze, already notified), and shows popups. More than 3 at once are summed up in one popup.
- **App watcher** every 3 seconds, while any reminder has an app trigger: `watch_apps` compares running processes and notifies for newly started ones.
- **Timer** every 500 ms: `run_timer` advances the Pomodoro timer, emits `pomodoro` and, at the end of a phase, `pomodoro-done`.

**Commands called from the UI**

| Area | Commands |
|---|---|
| Data | `load_data`, `save_data` |
| Floating window | `get_float_state`, `set_float`, `show_main` |
| Shortcuts | `set_shortcuts`, `suspend_shortcuts` (while recording a new one) |
| Look | `set_title_bar`, `get_accent` (Windows accent via `UISettings`), `set_round_corners` |
| Tray | `set_tray_status` (tooltip text) |
| Timer | `pomodoro_state`, `pomodoro_start`, `pomodoro_toggle`, `pomodoro_skip`, `pomodoro_reset` |
| Backups | `list_backups`, `backup_now`, `restore_backup`, `delete_backup`, `open_backup_folder`, `get_backup_folder`, `choose_backup_folder`, `clear_backup_folder`, `get_recovery`, `dismiss_recovery` |
| Export and import | `export_data`, `pick_import_file`, `import_data` |
| App triggers | `running_apps` (suggestions for the When I open box) |

**Events sent to the UI**

| Event | Sent to | Meaning |
|---|---|---|
| `data-changed` | both | The data was saved or replaced (restore, import) |
| `float-state` | both | The floating list was shown, hidden, locked or unlocked |
| `pomodoro` | both | Timer state |
| `pomodoro-done` | both; only `main` acts | A phase ended. The main window counts the session and plays the chime, so it happens once. |
| `popup-action` | `main` | Snooze, Done or a click on a popup |
| `new-reminder` | `main` | **Add reminder…** in the tray menu |

**Windows-specific parts**

- Title bar colours via DWM (`set_title_bar`).
- The accent colour via `UISettings`.
- Rounded corners on the floating window.
- Lock: makes the floating window click-through.
- Restoring the previously focused window after the floating list appears for a due reminder (`restore_foreground`).
- Toast popups with buttons and the reminder scenario (`show_popup`).

## The React front end

- **`src/` files**

  | File | What it holds |
  |---|---|
  | `types.ts` | Every data type |
  | `model.ts` | Pure data rules (no React) |
  | `dates.ts` | Date helpers and presets |
  | `quickAdd.ts` | Reading dates and priority from titles |
  | `calendar.ts` | Calendar grids |
  | `selection.ts` | Keyboard steps, ranges, search highlighting |
  | `pomodoro.ts` | Timer calls and the chime |
  | `verse.ts`, `verses.ts` | The verse of the day and its built-in verses |
  | `theme.ts` | Applying a theme, accent and window effects |
  | `shortcut.ts` | The shortcut recorder |
  | `updates.ts` | The updater |
  | `store.ts` | Loading, saving and syncing data |
  | `icons.tsx` | The one place icons come from |
  | `styles.css` | All styles |

- **`src/components/` files**

  | File | What it holds |
  |---|---|
  | `MainApp.tsx` | The main window: views, toolbar, the selection, keyboard handling, tray events |
  | `FloatApp.tsx` | The floating window |
  | `Sidebar.tsx` | The sidebar |
  | `TaskViews.tsx` | List and board layouts, grouping |
  | `TaskRow.tsx` | One reminder row |
  | `TaskControls.tsx` | Right-click menu, date picker, priority menu |
  | `Inspector.tsx` | The details panel |
  | `CalendarView.tsx`, `MiniCalendar.tsx` | The calendar and the floating list's mini calendar |
  | `RecentlyDeleted.tsx` | The Recently deleted view |
  | `Dialogs.tsx` | Settings (two panes: `SECTIONS`, `Setting`, `ShortcutRecorder`, `MinutesField`) and the list dialog |
  | `Backups.tsx` | The backups section and the recovery banner |
  | `Pomodoro.tsx` | The timer panel |
  | `Verse.tsx` | The verse card |
  | `UpdateBar.tsx` | The update bar |
  | `Undo.tsx` | The Undo toast |
  | `ui.tsx` | Shared Radix-based controls: `Modal`, `Dropdown`, `Menu`, `Tip`, `TipProvider` |
  | `useTaskActions.ts` | Every change to reminders, shared by all views |
  | `useRowDrag.ts` | Drag to reorder |

- **Styles** are one stylesheet. Theme colours are CSS custom properties set per `data-theme` on `<html>` (`--ui`, `--text`, `--text-2`, `--text-3`, `--line`, `--focus` and others). A "Fluent base" layer at the end gives all themes one layout. `data-density` switches row spacing.

## The data model

`AppData` (in `types.ts`), saved as `reminders.json`:

```ts
{
  version: 1,
  lists: ReminderList[],    // id, name, color (11), icon (12), sections (board columns)
  tasks: Task[],            // in list order; a list's order is the order here
  settings: Settings,       // shortcuts, theme, density, timer lengths, verse, float view and opacity, sticky popups
  deleted: DeletedItem[],   // Recently deleted, newest first
}
```

- **`Task` fields**
  - The basics: `id`, `listId`, `title`, `notes`, `flagged`, `priority` (0–3), `section`, `createdAt`.
  - Dates: `dueAt` and `dueHasTime`. A reminder with no time is stored at 09:00 local with `dueHasTime: false`.
  - Completion: `completed`, `completedAt`.
  - Repeats: `repeat`, `streak`, and `nextId` (the reminder its completion added, so undo can remove it).
  - Other features: `subtasks`, `nagMinutes`, `appTrigger`, `pomodoros`, `snoozedUntil`.
- **`DeletedItem`**: one deleted reminder, or a list with its reminders. It keeps the original positions (`listIndex`, `taskIndexes`). Items deleted together share a `batch`, which Undo restores as one.
- **`normalize`** (`model.ts`) turns any saved file into valid `AppData`, filling defaults and dropping bad values. That is how older files keep loading as fields are added; there are no migrations.
- **Smart lists and views**:
  - `View` is a smart list, a list, a search or Recently deleted.
  - `tasksFor` picks and sorts a view's reminders. Today and Upcoming sort by date; lists keep their order, with completed ones last.
  - `dayGroups` makes the Overdue and day headings.

## Shared mechanisms

- **Changing reminders** goes through `useTaskActions` (`useTaskActions.ts`):
  - `change` is for typing (the title, notes, subtasks and app box in the details panel). The panel's clicked controls use `quick`.
  - `quick` and `quickMany` are for menu, button, drag and selection-bar changes, and offer Undo.
  - `toggle` and `toggleMany` tick reminders off. A just-ticked reminder "lingers" for 1.2 s.
  - `move` handles drag reordering.
  - `add` adds a reminder and `commit` reads typed dates when the title is finished.
  - `remove`, `removeMany` and `removeEmptied` delete.
- **Undo** (`Undo.tsx`): one offer at a time, shown for 8 s.
  - `trash(deletion)` tags deleted items with a batch, and undoes with `undoDelete`.
  - `track(change, ids, message)` snapshots the affected reminders and their positions, and undoes with `restoreSnapshot`.
  - `show(message, revert)` offers any revert.
  - Toast wording comes from `deletedMessage`, `changeMessage`, `changeManyMessage` and `completedMessage` in `model.ts`.
- **Themes** (`theme.ts`):
  - `applyTheme` sets `data-theme`, the window effect (Mica on `main`, Acrylic on `float`, Windows 11 only) and the title bar colours.
  - `applyAccent` reads the Windows accent and uses it only at 4.5:1 contrast or better (`readableAccent`).
- **Drag and drop** uses the data type `text/task-id` (`TASK_DRAG`), accepted by list rows, board cards and columns, sidebar lists and calendar days.
- **Selection** lives in `MainApp`. It is `{ids, anchor, cursor}`, and ids that leave the view drop out. Screen order is read from the rows' `data-task-id` attributes, so it follows sections and board columns as drawn.

## Where each feature lives

| Feature | Version | Main code |
|---|---|---|
| Lists, smart lists, sections, board | Rewrite | `model.ts` (`tasksFor`, sections), `TaskViews.tsx`, `Sidebar.tsx` |
| Settings | Rewrite; two panes 0.15.0 | `SettingsDialog` in `Dialogs.tsx` (last section in `localStorage` `remme.settings`), `Modal` `className` in `ui.tsx`, `BackupsSection` in `Backups.tsx` |
| Details panel | Rewrite; redesigned 0.15.0 | `Inspector.tsx` (`WhenControls`, `MonthPicker`, the resizable edge, `remme.inspector` width in `localStorage`); `detailsInfo` and the repeat and nag wording in `changeMessage` (`model.ts`) |
| Search | Rewrite; marks 0.14.0 | `tasksFor` search branch; `highlightParts` in `selection.ts`, `TaskRow.tsx` |
| Floating list, lock, shortcuts | Rewrite | `FloatApp.tsx`; `set_float_locked`, `register_shortcuts` in `lib.rs`; `shortcut.ts` |
| Notifications | Rewrite; buttons 0.9.0 | `check_reminders`, `show_popup`, `popup_action` in `lib.rs`; `popup-action` listener in `MainApp.tsx` |
| Typed dates | 0.3.0; preview 0.12.0 | `quickAdd.ts` (`parseQuickAdd`, `quickAddSummary`) |
| Repeats, streaks | 0.3.0 | `setCompleted` in `model.ts`; `nextDue`, `stepDate`, `currentStreak` in `dates.ts` |
| Subtasks, nag | 0.3.0 | `Inspector.tsx`; nag in `should_notify` |
| When I open an app | 0.3.0 | `watch_apps`, `app_triggered`, `running_apps` in `lib.rs` |
| Rename | 0.4.0 | `copy_old_data` in `lib.rs` |
| Themes | 0.4.0; base 0.11.0 | `theme.ts`, `styles.css` |
| Pomodoro | 0.4.0 | `pomodoro.rs`, `run_timer` in `lib.rs`, `Pomodoro.tsx`, `pomodoro.ts` |
| Updates | 0.5.0 | `updates.ts`, `UpdateBar.tsx`, the updater plugin, `release.yml` |
| Title bar colour | 0.5.1 | `set_title_bar` in `lib.rs` |
| Calendar | 0.6.0 | `calendar.ts`, `CalendarView.tsx`, `MiniCalendar.tsx` |
| Verse of the day | 0.7.0 | `verse.ts`, `verses.ts`, `Verse.tsx` |
| Backups | 0.8.0 | `backup.rs`, backup commands in `lib.rs`, `Backups.tsx` |
| Undo, Recently deleted | 0.10.0 | `Undo.tsx`; `trashTasks`, `undoDelete`, `restoreDeleted`, `purgeDeleted` in `model.ts`; `RecentlyDeleted.tsx` |
| Fluent base, Radix, icons, density | 0.11.0 | `ui.tsx`, `icons.tsx`, `styles.css`, `get_accent` |
| Right-click menu, date and priority pickers | 0.12.0 | `TaskControls.tsx`; `presetDay`, `dueOnDay`, `dueAtTime` in `dates.ts` |
| Drag to reorder and onto lists | 0.13.0 | `useRowDrag.ts`, `moveTask` in `model.ts`, `Sidebar.tsx` |
| Undo for changes | 0.13.0 | `Undo.track`, `snapshot`, `restoreSnapshot`, `changeMessage` |
| Sidebar rail | 0.13.0 | `MainApp.tsx` (`useMedia`, `railChoice`), `Sidebar.tsx` |
| Float opacity | 0.13.0 | `Settings.floatOpacity`, `FloatApp.tsx` |
| Tray tooltip, Add reminder | 0.13.0 | `set_tray_status`, the tray menu in `lib.rs`; `new-reminder` in `MainApp.tsx` |
| Day groups | 0.14.0 | `dayGroups`, `dayGroupTitle` in `model.ts`; `TaskViews.tsx` |
| Empty views | 0.15.0 | `emptyMessage` in `model.ts`; `EmptyView` in `TaskViews.tsx` |
| Getting started examples | 0.15.0 | `first_run_data` in `lib.rs`, used by `load_or_recover` only when no data file exists |
| Snooze in the menu | 0.15.0 | `SNOOZE_PRESETS`, `snoozeUntil`, `canSnooze` in `dates.ts`; `TaskContextMenu`; `snoozedUntil` wording in `changeMessage` |
| Keyboard navigation, multi-select | 0.14.0 | `selection.ts`; the key handler and selection bar in `MainApp.tsx`; `toggleMany`, `quickMany`, `removeMany`; `updateTasks`, `changeManyMessage` in `model.ts` |

## Tests

| Command | What it covers |
|---|---|
| `pnpm test` (Vitest, 113 tests) | `model.test.ts` (smart lists, sections, sorting, repeats, normalize), `quickAdd.test.ts`, `calendar.test.ts`, `verse.test.ts`, `deleted.test.ts` (Recently deleted and Undo), `changes.test.ts` (moves, snapshots, toast wording, multi-change, day groups), `selection.test.ts` |
| `cargo test --manifest-path src-tauri/Cargo.toml` (32 tests) | Due-reminder detection, nagging and snooze; popup clicks; app triggers; copying data from the old folder; first-run examples; recovery from a damaged file; backup naming, pruning and the second folder; shortcut parsing; title bar colours; the Pomodoro state machine |

Pure logic sits in `model.ts`, `dates.ts`, `quickAdd.ts`, `calendar.ts` and `selection.ts` so it can be tested without React. UI behaviour is checked by running the dev build and scripting it through WebView2's remote debugging port (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" pnpm tauri dev`), against a backed-up and then restored data file.

## Building and releasing

- `pnpm tauri dev` runs the app with hot reload. `pnpm tauri build` makes the NSIS installer. Updates must be signed, so a local build needs `TAURI_SIGNING_PRIVATE_KEY`, or use `--no-sign`.
- **Release**:
  1. Set the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and update `Cargo.lock` with `cargo update -p remme --offline --manifest-path src-tauri/Cargo.toml`.
  2. Commit `Release x.y.z`, push `main`, tag `vx.y.z` and push the tag.
  3. `release.yml` then:
     - checks the tag matches the version
     - runs both test suites
     - builds and signs the installer
     - publishes a GitHub release with `latest.json`, which installed copies check every 6 hours
- The signing key is at `%USERPROFILE%\.tauri\remme.key` and in the repository secret. Its public half is in `tauri.conf.json`.

## How work is done in this repo

- Each feature follows these steps:
  1. A grilling session to settle the design.
  2. A spec in `.scratch/<feature>/spec.md`, excluded from git through `.git/info/exclude`, so it stays on this PC. `PLAN.md` names each spec.
  3. Build it with tests.
  4. Check it in the real app.
  5. Commit it as `feat: …`.
  6. Commit the version bump as `Release x.y.z`.
- The owner pushes and tags; agents give the commands.
- Commits carry no AI co-author lines.
- Use pnpm, never npm.
- Every feature release also updates `README.md`, [FEATURES.md](FEATURES.md) and this file.
