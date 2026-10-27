# Reminders

A Windows reminders app styled after Apple Reminders, with a floating list that stays on top of other windows and can be locked so clicks pass through it.

Built with [Tauri 2](https://tauri.app), React and TypeScript.

## Features

- **Smart lists:** Today, Scheduled, All, Flagged and Completed tiles with live counts.
- **Your own lists,** each with a color and an icon. Double-click or right-click a list to edit or delete it.
- **List and board layouts.** In a list's board view, sections are columns (for example one per person). Drag cards between columns, add sections at the right, and rename or delete them from the column header.
- **Reminders** have a title, notes, a date with optional time, a flag, a priority (`!`, `!!`, `!!!`), a list and a section. Click **ⓘ** on a reminder to open its details.
- **Notifications:** a Windows notification appears when a reminder is due. Due checks run every 15 seconds while the app is running, and overdue reminders notify at startup. A due reminder also brings up the floating list.
- **Floating list:** a small always-on-top window showing any smart list or list. Pick which one from its header.
  - **Ctrl+Shift+O** shows or hides it from any app.
  - **Ctrl+Shift+L** locks or unlocks it. When locked, the window is slightly transparent, can't be moved or edited, and mouse clicks go through it to the window behind.
  - Change either shortcut in **Settings** (gear icon). Click the shortcut, then press the new keys.
- **Tray icon:** closing a window keeps Reminders running in the tray. Left-click the icon to open the app; right-click it for the floating list controls and **Quit**.
- **Start with Windows** (in Settings) launches the app at sign-in, hidden in the tray.

Keyboard: **Ctrl+N** adds a reminder, **Enter** in a title adds the next one, **Esc** leaves a title. A reminder whose title is left empty is removed.

Data is saved to `%APPDATA%\com.reminders.app\reminders.json`. Floating window state and the list of reminders already notified are in `ui-state.json` next to it. A file that can't be read is renamed to `*.json.corrupt` and the app starts fresh.

## Requirements

- Windows 10 or 11 with the WebView2 runtime (included in Windows 11)
- [Node.js](https://nodejs.org) 20 or later
- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- Visual Studio C++ build tools ("Desktop development with C++")

## Develop

From the repository root:

```powershell
npm install
npm run tauri dev
```

The first build compiles the Rust dependencies and takes a few minutes; later builds are fast. Edits to files under `src/` reload instantly.

Run the tests:

```powershell
npm test                         # TypeScript: smart lists, dates, sections, shortcut recorder
cargo test --manifest-path src-tauri/Cargo.toml   # Rust: due-reminder detection, shortcut parsing
```

## Build an installer

```powershell
npm run tauri build
```

This writes an installer to `src-tauri\target\release\bundle\nsis\Reminders_<version>_x64-setup.exe`. The installed app needs nothing else on the target PC except WebView2.

## Project layout

- `src/`: React UI. `model.ts` holds data rules (smart lists, sections, sorting), `store.ts` loads, saves and syncs data between the two windows, and `components/` has the screens.
- `src-tauri/src/lib.rs`: saving files, reminder notifications, global shortcuts, the tray icon and the floating window's lock.
- `src-tauri/tauri.conf.json`: window definitions (`main` and `float`).
