# Plan: Apple Reminders-style app for Windows with a floating, lockable list

The first version (steps 1–9 in git history before the `tauri-rewrite` branch) was a WPF sticky-note app. It was replaced by a Tauri 2 + React + TypeScript app.

- [x] 1. Replace WPF with Tauri 2 + React + TypeScript (Vite)
- [x] 2. Rust backend: JSON storage with atomic writes, data sync between windows, due-reminder notifications, tray icon, single instance, Start with Windows, remembered window positions
- [x] 3. Apple Reminders-style main window: smart list tiles, user lists with colors and icons, list and board layouts, sections, details panel, search, clear completed
- [x] 4. Floating window: always on top, choosable list, quick add; Ctrl+Shift+O shows or hides it, Ctrl+Shift+L locks it (click-through, translucent)
- [x] 5. Settings: record new global shortcuts, Start with Windows
- [x] 6. Tests: TypeScript model tests (vitest) and Rust due-check tests
- [ ] 7. Ideas for later: natural-language quick add, repeating reminders, subtasks, app-triggered reminders, nag mode, habit streaks
