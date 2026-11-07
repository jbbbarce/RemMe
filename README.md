# RemMe

A Windows reminders app with a floating list that stays on top of other windows and can be locked so clicks pass through it.

Built with [Tauri 2](https://tauri.app), React and TypeScript.

## Features

- **Themes:** pick one in **Settings** (gear icon). It applies at once to both windows.
  - **Sharp dark pro** (default): near-black, thin borders, an indigo accent.
  - **Calm minimal:** warm and roomy, with a teal accent. Follows Windows light or dark mode.
  - **Paper and ink:** cream paper, serif headings, hand-drawn-style checkboxes.
  - **Windows Fluent:** Segoe UI and Windows colours. Follows Windows light or dark mode, with the see-through Mica background on Windows 11.
  - The window's title bar takes the theme's colour too (on Windows 10, only light or dark).
- **Smart lists:** Today, Upcoming, All, Flagged and Done, with live counts.
- **Calendar** (in the sidebar): dated reminders from every list on a **Month** or **Week** grid, in their list's colour. The week starts on the day your Windows region uses.
  - Click an empty part of a day to type a reminder there (`Call mom 5pm` sets the time on that day; a typed date such as `tomorrow` wins). Click a reminder to open its details, or tick it done in place.
  - Drag a reminder to another day to move it; its time stays. Drag one onto the **No date** column to remove its date, or from there onto a day to give it one.
  - A repeating reminder's later dates show faded. Overdue reminders stay on their day, in red. **Show done** shows finished ones.
  - In the floating list, pick **Calendar** from its list picker for a small month view with the chosen day's reminders.
- **Your own lists,** each with a color and an icon. Double-click or right-click a list to edit or delete it.
- **List and board layouts.** In a list's board view, sections are columns (for example one per person). Drag cards between columns, add sections at the right, and rename or delete them from the column header.
- **Reminders** have a title, notes, a date with optional time, a flag, a priority (`!`, `!!`, `!!!`), a list and a section. Click **ⓘ** on a reminder to open its details.
- **Natural-language add:** type a date, time or priority into a new reminder's title and it is set for you when you finish typing. For example, `Call mom tomorrow 5pm !!` becomes "Call mom", due tomorrow at 5:00 PM with medium priority. It understands today, tonight, tomorrow, weekdays (`friday`, `next mon`), dates (`oct 30`, `30 oct`), `in 3 days`, `in 20 minutes`, times (`5pm`, `5:30 pm`, `17:00`, `at 6`, `noon`) and repeats (`daily`, `every week`, `every thursday`). This also works in the floating list's add box.
- **Repeating reminders:** set **Repeat** (daily, weekly, monthly or yearly) in a reminder's details. Checking it off keeps the done one in Completed and adds the next one; uncheck it straight away to take that back. A reminder finished late comes back on its next future date.
- **Subtasks:** add a checklist in a reminder's details. The row shows how many are done, and the next repeat starts with them all unchecked.
- **Nag mode:** set **Nag** in a reminder's details and its notification repeats every 5, 10, 15, 30 or 60 minutes until you check it off.
- **Pomodoro timer:** 25-minute focus sessions with 5-minute breaks, and a 15-minute long break after every fourth. The timer is at the bottom of the sidebar and in the floating list's header.
  - Start a plain session there, or press the timer button on a reminder (or **Focus on this** in its details) to focus on that reminder.
  - Breaks start by themselves; the next focus session waits for you. A notification and a quiet chime mark the end of each session.
  - **Ctrl+Shift+P** starts or pauses the timer from any app, even while the floating list is locked.
  - Each reminder counts its finished sessions, and the timer shows today's total.
  - Change the lengths, the chime and the shortcut in **Settings**. The timer resets if you quit RemMe.
- **Verse of the day:** a Bible verse from the World English Bible (British Edition, with the deuterocanonical books) that changes at midnight. It's in the sidebar above the timer and at the bottom of the floating list. Turn it off in **Settings**.
  - Click the verse to copy it with its reference.
  - In the sidebar, the arrow switches between the whole verse and 2 lines.
  - In the floating list, drag the line above the verse to make it taller or shorter (it scrolls if it doesn't fit); double-click that line to fit the verse again.
  - The **–** button minimizes the verse to a bar with its reference; click the bar to bring it back. Each window minimizes on its own, and the next day's verse opens again by itself.
- **Habit streaks:** a repeating reminder shows a flame and how many times in a row it was done by its due day. Finishing one late, or letting its day pass, starts the count over.
- **App-triggered reminders:** set **When I open** in a reminder's details to an app, such as `chrome.exe` (the box suggests apps that are running now). Each time that app starts, you get a notification about the reminder until it's done. Apps already running when RemMe starts don't count.
- **Notifications:** a Windows notification appears when a reminder is due. Due checks run every 15 seconds while the app is running, and overdue reminders notify at startup. A due reminder also brings up the floating list.
- **Floating list:** a small always-on-top window showing any smart list or list. Pick which one from its header.
  - **Ctrl+Shift+O** shows or hides it from any app.
  - **Ctrl+Shift+L** locks or unlocks it. When locked, the window is slightly transparent, can't be moved or edited, and mouse clicks go through it to the window behind.
  - Change either shortcut in **Settings** (gear icon). Click the shortcut, then press the new keys.
- **Tray icon:** closing a window keeps RemMe running in the tray. Left-click the icon to open the app; right-click it for the floating list controls and **Quit**.
- **Updates:** RemMe checks GitHub for a new version when it starts and every 6 hours. When one is out, a bar at the bottom of the window offers **Update and restart**; your reminders and settings stay. **Settings** shows the version you have and a **Check for updates** button.
- **Start with Windows** (in Settings) launches the app at sign-in, hidden in the tray.

Keyboard: **Ctrl+N** adds a reminder, **Enter** in a title adds the next one, **Esc** leaves a title. A reminder whose title is left empty is removed.

Data is saved to `%APPDATA%\com.remme.app\reminders.json`. The first time RemMe starts, it copies your data from `%APPDATA%\com.reminders.app\`, where versions before the rename kept it. Floating window state and the list of reminders already notified are in `ui-state.json` next to it. A file that can't be read is renamed to `*.json.corrupt` and the app starts fresh.

## Requirements

- Windows 10 or 11 with the WebView2 runtime (included in Windows 11)
- [Node.js](https://nodejs.org) 20 or later and [pnpm](https://pnpm.io)
- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- Visual Studio C++ build tools ("Desktop development with C++")

## Develop

From the repository root:

```powershell
pnpm install
pnpm tauri dev
```

The first build compiles the Rust dependencies and takes a few minutes; later builds are fast. Edits to files under `src/` reload instantly.

Run the tests:

```powershell
pnpm test                        # TypeScript: smart lists, dates, sections, shortcut recorder
cargo test --manifest-path src-tauri/Cargo.toml   # Rust: due-reminder detection, shortcut parsing
```

## Build an installer

```powershell
pnpm tauri build
```

This writes an installer to `src-tauri\target\release\bundle\nsis\RemMe_<version>_x64-setup.exe`. The installed app needs nothing else on the target PC except WebView2.

Updates must be signed, so a local build needs the signing key in `TAURI_SIGNING_PRIVATE_KEY` (the key's text or its file path). Without it, use `pnpm tauri build --no-sign` for a build you only run yourself.

## Release a new version

GitHub Actions builds and publishes releases (`.github/workflows/release.yml`). Installed copies of RemMe then offer the update.

1. Set the new version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and merge it to `main`.
2. Tag that commit and push the tag:

   ```powershell
   git tag v0.5.0
   git push origin v0.5.0
   ```

3. The workflow checks the tag matches the version, runs the tests, builds and signs the installer, and publishes a release with it and `latest.json`.

One-time setup: the signing key lives at `%USERPROFILE%\.tauri\remme.key` and in the repository secret `TAURI_SIGNING_PRIVATE_KEY`. Its public half is `plugins.updater.pubkey` in `tauri.conf.json`. Keep a backup of the private key: without it, installed copies can't accept new updates.

## Project layout

- `src/`: React UI. `model.ts` holds data rules (smart lists, sections, sorting), `store.ts` loads, saves and syncs data between the two windows, and `components/` has the screens.
- `src-tauri/src/lib.rs`: saving files, reminder notifications, global shortcuts, the tray icon and the floating window's lock.
- `src-tauri/tauri.conf.json`: window definitions (`main` and `float`).

## License

MIT. See [LICENSE](LICENSE).
