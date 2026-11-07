# Plan: RemMe, a Windows reminders app with a floating, lockable list

The first version (steps 1–9 in git history before the `tauri-rewrite` branch) was a WPF sticky-note app. It was replaced by a Tauri 2 + React + TypeScript app.

- [x] 1. Replace WPF with Tauri 2 + React + TypeScript (Vite)
- [x] 2. Rust backend: JSON storage with atomic writes, data sync between windows, due-reminder notifications, tray icon, single instance, Start with Windows, remembered window positions
- [x] 3. Apple Reminders-style main window: smart list tiles, user lists with colors and icons, list and board layouts, sections, details panel, search, clear completed
- [x] 4. Floating window: always on top, choosable list, quick add; Ctrl+Shift+O shows or hides it, Ctrl+Shift+L locks it (click-through, translucent)
- [x] 5. Settings: record new global shortcuts, Start with Windows
- [x] 6. Tests: TypeScript model tests (vitest) and Rust due-check tests
- [x] 7. Natural-language quick add, repeating reminders, subtasks, nag mode
- [x] 8. App-triggered reminders, habit streaks
- [x] 9. Rename to RemMe (new app id, data copied from the old folder) and add an MIT license
- [x] 10. Themes: shared non-Apple layout; Sharp dark pro (default), Calm minimal, Paper and ink, Windows Fluent with Mica; new logo
- [x] 11. Pomodoro timer: standalone or on a reminder, runs in the backend, floating-list pill, sidebar panel, Ctrl+Shift+P, tomato counts
- [x] 12. Updates: in-app updater (asks, then installs and restarts) and a GitHub Actions release on version tags
- [x] 13. Title bar follows the theme (Windows title bar recoloured; light/dark only on Windows 10)
- [x] 14. Calendar: month and week views of dated reminders, add/drag/tick in place, faded repeats, No date column, mini calendar in the floating list
- [x] 15. Verse of the day: built-in WEB British Edition verses (with deuterocanonical books), sidebar card and a resizable, minimizable panel at the bottom of the floating list. Spec: `.scratch/verse-of-the-day/spec.md`
