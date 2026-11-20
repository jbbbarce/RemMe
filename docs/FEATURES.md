# RemMe features

Everything RemMe can do, from the first sticky-note version to 0.18.0, and when each part arrived. For how it is built, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Contents

- [Release timeline](#release-timeline)
- [Before the rewrite: the WPF sticky notes](#before-the-rewrite-the-wpf-sticky-notes)
- [Reminders](#reminders)
- [Lists and views](#lists-and-views)
- [Changing reminders quickly](#changing-reminders-quickly)
- [Selecting and the keyboard](#selecting-and-the-keyboard)
- [Undo and Recently deleted](#undo-and-recently-deleted)
- [Calendar](#calendar)
- [Floating list](#floating-list)
- [Notifications](#notifications)
- [Coach](#coach)
- [Pomodoro timer](#pomodoro-timer)
- [Verse of the day](#verse-of-the-day)
- [Look and feel](#look-and-feel)
- [Tray icon and running in the background](#tray-icon-and-running-in-the-background)
- [Backups, export and import](#backups-export-and-import)
- [Updates](#updates)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Where your data is](#where-your-data-is)
- [Not yet verified](#not-yet-verified)
- [Planned](#planned)

## Release timeline

| Version | Date | What came in |
|---|---|---|
| WPF steps 1–9 | 26 Oct 2026 | The original app: always-on-top sticky notes with colours, a reminder time, a tray icon and Start with Windows. Replaced by the rewrite. |
| Rewrite | 27 Oct | Tauri + React + TypeScript. Main window with smart lists, your own lists, list and board layouts, sections, details, search. The floating list with show and lock shortcuts. Notifications, tray icon, Start with Windows, Settings. |
| 0.3.0 | 2 Nov | Typing dates into titles, repeating reminders, subtasks, nag mode, habit streaks, reminders when an app opens. |
| 0.4.0 | 4 Nov | Renamed to RemMe, with an MIT license and a new logo. Four themes. The Pomodoro timer. |
| 0.4.1 | 4 Nov | Readable drop-downs in every theme; theme fonts. |
| 0.5.0 | 5 Nov | In-app updates and published releases. |
| 0.5.1 | 6 Nov | The window title bar takes the theme's colour. |
| 0.6.0 | 6 Nov | The calendar, and a mini calendar in the floating list. |
| 0.7.0 | 8 Nov | Verse of the day. |
| 0.8.0 | 9 Nov | Automatic backups, a second backup folder, recovery from a damaged file, export and import. |
| 0.9.0 | 15 Nov | Snooze and Done buttons on popups; popups that stay on screen; click a popup to open its reminder. |
| 0.10.0 | 15 Nov | Undo after deleting, and Recently deleted. |
| 0.11.0 | 16 Nov | The UI rebuilt on Fluent 2: shared layout for all themes, Fluent icons, new menus and dialogs, accessibility, Compact rows. Windows Fluent became the default theme. |
| 0.12.0 | 16 Nov | The right-click menu on reminders, a clickable date and priority, and a preview of typed dates. |
| 0.13.0 | 16 Nov | Drag to reorder and onto lists, Undo for ticking off and quick changes, the sidebar icon strip, floating list opacity, tray tooltip and Add reminder. |
| 0.14.0 | 17 Nov | Overdue and day groups, keyboard navigation, multi-select with a selection bar, search highlighting. |
| 0.15.0 | 18 Nov | Friendlier empty views, a Getting started list on first run, Snooze in the reminder menu, a redesigned details panel, Settings as a two-pane page, and the sidebar's verse and timer as one-line bars. |
| 0.16.0 | 18 Nov | The calendar's repeats as small counts, wrapping titles, dimmed other months and labelled toggles; the floating list's verse as a one-line bar; board columns that share the width with a ⋯ menu per section; the list dialog's labelled fields and even grids; the old CSS the redesign replaced removed. |
| 0.17.0 | 19 Nov | Coach: focus hours, a distraction list, the Nudge and Push popups, real talk, Pause and the tray marker. Old CSS removed. |
| 0.18.0 | 20 Nov | Coach's natural voice: the Push and real talk spoken aloud, on your PC. |

## Before the rewrite: the WPF sticky notes

The first version, built on 26 October 2026, was a C# WPF app of sticky notes. All of it was replaced the next day; none of its code is left. It had:

- A yellow note window that stayed on top of other windows, with no title bar. You dragged it by its header and resized it from a corner grip.
- Note text that saved itself to `%APPDATA%\Reminders\notes.json`.
- Each note's position and size remembered. A note left off-screen (a monitor unplugged) came back onto the main screen.
- Several notes, with **+** to add one and **×** to delete one (asking first if it had text).
- Six colours per note: yellow, pink, green, blue, purple and orange.
- A tray icon with **New note**, **Show all notes**, **Hide all notes** and **Exit**. Notes put themselves back on top every 2 seconds.
- An optional reminder time per note. When due, the note appeared, flashed and played a sound until clicked.
- **Start with Windows** in the tray menu.

What carried over into RemMe: the always-on-top window (now the floating list), the tray icon, reminders at a set time and Start with Windows.

## Reminders

- **The basics** (rewrite): a reminder has a title, notes, a date with or without a time, a flag, a priority, a list and a section. Tick it off with its checkbox. A just-finished reminder stays in place for a moment before it leaves the list. Click **ⓘ** to open its **details** panel, where everything can be changed. A reminder whose title you leave empty is removed.
- **The details panel** (rewrite; redesigned in 0.15.0):
  - **Top:** a large title that grows to several lines, with a checkbox to tick the reminder off. Notes sit under it in smaller, lighter text.
  - **When:** the date with **×** to remove it, then Today, Tomorrow, Next week and **Pick…**, a month calendar that starts the week the way your region does. For a dated reminder there's also the time (No time, 9:00 am, Noon, 6:00 pm, or a time field) and Repeat.
  - **Alerts:** Nag and the snooze status (with **Stop snoozing**) for a dated reminder, and **Remind me when I open an app** with a one-line explanation.
  - **Subtasks**, with a done count.
  - **Organise:** List, Section, Priority (None / Low / Medium / High) and Flagged.
  - **Footer**, always visible: when it was created and done, focus sessions and the on-time streak, then **Focus on this** and **Delete**.
  - Clicked changes offer Undo, the same as the right-click menu; typing in the title, notes, subtasks or app box doesn't.
  - Drag its left edge to make it 280–520 px wide; RemMe remembers the width, and double-clicking the edge resets it. With the edge focused, the arrow keys resize it.
  - **Esc** closes it. In a window narrower than 760 px it floats over the list instead of squeezing it.
- **Priority** (rewrite; chips in 0.11.0): Low, Medium or High, shown as a small coloured chip beside the date.
- **Typing dates into the title** (0.3.0): type `Call mom tomorrow 5pm !!` and it becomes "Call mom", due tomorrow at 5:00 PM, Medium priority, when you finish typing. It understands:
  - days: today, tonight, tomorrow, weekdays (`friday`, `next mon`), dates (`oct 30`, `30 oct`), `in 3 days`
  - times: `5pm`, `5:30 pm`, `17:00`, `at 6`, `noon`, `in 20 minutes`
  - repeats: `daily`, `every week`, `every thursday`
  - priority: `!` Low, `!!` Medium, `!!!` High
  - **Preview** (0.12.0): while you type a new reminder, small labels under it show what it will set. The floating list's add box shows them too.
- **Repeating reminders** (0.3.0): daily, weekly, monthly or yearly. Ticking one off keeps the done one and adds the next. A reminder done late comes back on its next future date, not on a day already gone. Monthly and yearly repeats on the 31st use the month's last day when it is shorter.
- **Subtasks** (0.3.0): a checklist in the details panel. The row shows how many are done; the next repeat starts with them unchecked.
- **Nag mode** (0.3.0): the notification repeats every 5, 10, 15, 30 or 60 minutes until the reminder is ticked off.
- **Habit streaks** (0.3.0): a repeating reminder shows a flame and how many times in a row it was done by its due day. Finishing late, or letting the day pass, starts the count again.
- **When I open an app** (0.3.0; "Remind me when I open an app" since 0.15.0): set an app such as `chrome.exe` (the box suggests apps running now) and you get a notification about the reminder each time that app starts, until it's done.
- **Snoozed** (0.9.0): a snoozed reminder shows *Snoozed until …*; clear it in its details.
- **Getting started** (0.15.0): a brand-new install opens with a **Getting started** list of five example reminders: a welcome note due today, typing a date into a title (due today), right-clicking for quick changes (flagged), the floating list shortcut (due tomorrow), and deleting the list when you're done. An install that copies older data, or recovers from a damaged file, doesn't get them.

## Lists and views

- **Smart lists** (rewrite): **Today**, **Upcoming**, **All**, **Flagged** and **Done**, with live counts in the sidebar. Counts of zero are hidden (0.11.0).
- **Day groups** (0.14.0):
  - **Today** puts overdue reminders under a red **Overdue** heading at the top.
  - **Upcoming** groups by day: Overdue, Today, Tomorrow, each weekday of the coming week, *Later this month*, then each month.
  - Rows in these two views show their list's name.
- **Your own lists** (rewrite): each has a name, one of 11 colours and one of 12 icons. Add one with **+** beside **Lists** (0.11.0). Edit or delete a list from its **⋯** button, or by double-clicking or right-clicking it.
  - **The list dialog** (0.16.0): titled **New list** or **Edit list**, with a labelled **Name** box, the 11 colours in one row under **Colour** and the 12 icons in a 6 × 2 grid under **Icon**. The chosen ones have an accent ring (and a check on the colour). Each has a readable name for screen readers.
- **List and board layouts** (rewrite): switch with **List** / **Board** at the top.
  - In a list, **sections** group reminders; on the board they are columns (for example one per person). Reminders in no section are under **No section** (called *Others* before 0.16.0).
  - **Board columns** (0.16.0) share the window's width, 220–360 px each, and scroll sideways when they don't fit. Each column ends with a quiet **+ Add reminder** row, and **+ Add section** at the right opens a name box (Enter adds it, Esc cancels).
  - **Section menu** (0.16.0): each section's **⋯** has **Rename** (or double-click the name), **Move left**, **Move right** and **Delete section**. Deleting moves its reminders to No section and offers Undo.
  - On the board, drag cards between columns.
- **Search** (rewrite): the box at the top of the sidebar searches titles and notes in every list. Results are grouped by list.
  - **Highlighting** (0.14.0): the words you searched for are marked in each title and in its notes.
- **Show done** (rewrite; a switch since 0.11.0): shows finished reminders in a list or search.
- **Empty views** (0.15.0): an empty view shows its icon, what would appear there and how to get it there, for example *Nothing due today* or *No flagged reminders: right-click a reminder and choose Flag*. A search with no results says where search looks. A list or search whose only matches are finished points to **Show done**. The floating list shows the same heading.
- **Clear completed** (rewrite; in the **⋯** menu since 0.11.0): moves a view's finished reminders to Recently deleted.
- **Drag and drop** (0.13.0):
  - In one of your lists, drag a reminder up or down to change its order. A grip shows in the left margin, and a line shows where it will land.
  - Drag a reminder onto a list in the sidebar to move it there.
  - On a board, drop a card onto another card to place it there, or onto a column.
  - Today and Upcoming sort by date, so there you can drag reminders out but not reorder them.
- **Narrow windows** (0.13.0): below 900 px wide, the sidebar becomes a strip of icons with names in tooltips. The search icon widens it again, and the button at the top left shows or hides it at any width.

## Changing reminders quickly

All of these came in 0.12.0 and offer Undo since 0.13.0.

- **Right-click a reminder** for:
  - Date: Today, Tomorrow, Next week (the coming Monday), each with its date, or No date. A reminder with a time keeps it.
  - Priority, Move to (another list), Flag or Remove flag
  - Snooze (0.15.0), on reminders due today or overdue: 10 minutes, 1 hour, 3 hours or tomorrow at 9:00 am, and **Stop snoozing**. As with the popup's Snooze, the due time stays and only the popup waits. On a selection it snoozes them all.
  - Focus on this (starts the timer), Details and Delete

  Right-clicking inside a title you're typing gives the usual cut, copy and paste instead.
- **Click a reminder's date** for Today, Tomorrow, Next week or any date, and No time, 9:00 am, Noon, 6:00 pm or any time. **Remove date** takes it off (and ends any repeat or nag, which need a date).
- **Click a reminder's priority chip** to change it.

## Selecting and the keyboard

From 0.14.0.

- **Select one**: click a reminder, or move to it with the arrow keys.
- **Select several**: **Ctrl+click** adds or removes one, **Shift+click** or **Shift+↑/↓** selects everything between, **Ctrl+A** selects all.
- **The selection bar**: with two or more selected, a bar under the heading offers **Complete** (or **Not done**), **Date**, **Priority**, **Move to**, **Flag** (or **Unflag**) and **Delete**, then **×** to clear the selection. Each action has one Undo for all of them. Changing the date keeps each reminder's own time.
- **Right-clicking a selected reminder** makes its menu act on the whole selection ("Delete 3 reminders").
- **Keyboard**: see [Keyboard shortcuts](#keyboard-shortcuts). Deleting selects the next reminder, so you can keep going.

## Undo and Recently deleted

- **Undo after deleting** (0.10.0): deleting a reminder, clearing completed ones or deleting a list shows an **Undo** toast for 8 seconds, in the main window or the floating list. **Ctrl+Z** does the same while it shows (inside a text box, Ctrl+Z still undoes typing). Undo puts everything back where it was.
- **Undo after other changes** (0.13.0): ticking a reminder off, a change from its menu, date or priority button, dragging it to another list, column or calendar day, and (0.14.0) any change from the selection bar. Undoing a ticked-off repeating reminder also takes back the next one it added. Typing in the details panel and plain reordering don't show a toast.
- **Recently deleted** (0.10.0): below the lists in the sidebar. Deleted reminders and lists stay there for 30 days.
  - **Restore** puts one back at the end of its list (or your first list if its list is gone); restoring a list brings its reminders too.
  - The bin button deletes one for good, and **Empty Recently Deleted** clears them all. Both ask first.
  - A new reminder you never typed into is just dropped. Deleted reminders don't notify, and don't show in counts, search or the calendar. They are kept in backups and exports.

## Calendar

From 0.6.0, in the sidebar.

- **Month** and **Week** grids of dated reminders from every list, in their list's colour. The week starts on the day your Windows region uses.
- Click an empty part of a day to type a reminder there. `Call mom 5pm` sets the time on that day; a typed date such as `tomorrow` wins.
- Click a reminder to open its details, or tick it done in place.
- Drag a reminder to another day; its time stays. Drag it onto the **No date** column to remove its date, or from there onto a day to give it one. Since 0.13.0 a drag offers Undo.
- **Repeats** (0.16.0): a repeating reminder shows in full only on its next date. Its later dates in view become a small **↻** count in the day's corner; hover it to see which reminders repeat there. **Show repeats** shows them all in full, faded, as before 0.16.0.
- **Titles** (0.16.0): in **Month**, titles wrap to two lines with the time on a small line under them. A busy day shows up to three reminders, fewer on a short window so **+N more** always fits; **+N more** opens the day's full list. **Week** keeps the time beside the title and lets titles wrap.
- **Other months** (0.16.0): the previous and next month's days are dimmed, with lighter numbers and faded reminders. They still take drops.
- **Toggles** (0.16.0): **Show done**, **Show repeats** and **No date** are labelled buttons above the calendar, lit while on, and each is remembered. Overdue reminders stay on their day, in red.
- **Mini calendar**: in the floating list, pick **Calendar** from its list picker for a small month with the chosen day's reminders.

## Floating list

- **The window** (rewrite): a small always-on-top window showing any smart list or one of your lists, picked from its header. It has its own add box, which understands typed dates like a new reminder does.
- **Ctrl+Shift+O** (rewrite) shows or hides it from any app.
- **Ctrl+Shift+L** (rewrite) locks it. Locked, it is slightly see-through, can't be moved or edited, and clicks pass through to the window behind. Change both shortcuts in **Settings → Shortcuts**: click a shortcut, then press the new keys.
- **Opacity** (0.13.0): **Settings → Floating list → Opacity**, 40–100 %. Locked, it is a little fainter still.
- It remembers where it was. A due reminder brings it up (rewrite). It shows the Pomodoro timer in its header (0.4.0) and the verse of the day at the bottom (0.7.0). Rows are always compact.
- In a list (and unlocked), drag reminders to reorder them (0.13.0).

## Notifications

- **Due reminders** (rewrite): a Windows notification appears when a reminder is due. RemMe checks every 15 seconds while running, and overdue reminders notify when it starts. When more than 3 are due at once, the rest are summed up in one popup.
- **Snooze from the app** (0.15.0): see [Changing reminders quickly](#changing-reminders-quickly).
- **Snooze and Done** (0.9.0): popups have **Snooze 10 min**, **Snooze 1 hour** and **Done**. Snoozing keeps the due time and only brings the popup back later. Done is the same as ticking it off. Click the popup itself to open the reminder's details.
- **Popups that stay** (0.9.0): reminder popups stay on screen until you respond, because Windows only passes on a button press while the popup shows. Turn it off in **Settings → Notifications**.
- **Nag** and **When I open** popups: see [Reminders](#reminders). "You opened <app>" popups have a **Done** button.

## Coach

From 0.17.0. Off until you turn it on in **Settings → Coach**. Coach is for procrastination: during your focus time it notices when you're off track and points you back to what's due, more firmly the longer it goes on.

- **Focus time**: inside your **focus hours** (each weekday gets up to three time ranges, with presets "Weekdays 9–5" and "Every evening 7–10"), or during any focus timer session at any hour. A switch, **Also when something is overdue**, adds any time a reminder is overdue.
- **Distractions**: a list you edit, starting with YouTube, Netflix, TikTok, Reddit, Facebook, Instagram, X, Twitch, Steam, Epic Games and Discord.
  - A **Site** counts when its name is a whole word in a **browser's** window title (Chrome, Edge, Firefox, Brave, Opera, Vivaldi). A document called "YouTube plan" doesn't count.
  - An **App** counts when it's the window in front.
- **Idle**: no mouse or keyboard for 10 minutes (adjustable). A video playing on a distraction counts as the distraction, not as idle.
- **The ladder**:
  - After **1 minute** off track without a stop, a **Nudge**: a small popup in the bottom-right of the screen you're using, naming what to do. It's silent and goes away by itself after 30 seconds.
  - After **5 minutes**, a **Push**: bigger, with a sound, and it stays until you answer. It comes back every 5 minutes while you stay off track.
  - Getting back on track for **2 minutes** in a row starts the ladder over. A quick flick back to your work doesn't.
  - The popups don't take focus from the app you're in, and Windows' Do Not Disturb doesn't silence them.
- **What it names**: the focus session's reminder, otherwise the most overdue reminder, then the next due today, then a flagged one. With none of those, a general "This is your focus time" line.
- **Answers**: **Back to it** opens the reminder in the main window. **Start focus** starts a focus session on it and restarts the ladder. **Dismiss** closes the popup.
- **Real talk**: after **20 minutes off track in total** in one focus block, the Push switches to a blunt voice, such as "How can you have dreams if you ain't even doing anything?" It goes after your time and choices, never you as a person. It ends after 15 minutes back on track. Add your own lines in Settings (`{reminder}` puts in what's due), or switch real talk off.
- **Pause**: 15 minutes, 1 hour or the rest of the day, from the tray's **Coach** menu, the sidebar's **Coach** bar or the floating list's Coach button. **Resume** ends a pause early. Coach is switched off only in Settings.
- **Seeing that it's on**:
  - The tray icon gets an amber dot while Coach is watching.
  - The tray tooltip and the sidebar bar say "watching until 5:00 pm", "paused until 3:15 pm" or "on, waiting for focus time".
- **Privacy**:
  - It reads only the front window's app and title and your idle time, about every 5 seconds, and only during focus time.
  - It never takes screenshots and never stores window titles.
  - It sends nothing anywhere and never closes your apps.
  - With Coach off, nothing runs.
- **Known limits**:
  - Coach only sees window titles, so a distraction whose window title doesn't name it isn't caught.
  - Coach can't tell when you're in a call; use Pause.
  - Coach only works while RemMe is running.
- **Voice** (0.18.0): turn on **Speak** in **Settings → Coach → Voice** and Coach reads the Push and real talk aloud. The Nudge stays silent.
  - **Download**: the first time, it downloads the voice once, about 95 MB, from Kokoro's official files (pinned to one version). Every file is checked against a fingerprint built into RemMe, and a file that doesn't match is thrown away. If anything is off, Speak turns off with a message and **Try again**.
  - **Voices**: **Heart** (the default), **Bella**, **Emma** (British), **Michael** and **Fenrir**, with an optional separate **real talk voice**. **Speed** and **Volume** sliders, and **Test** plays a sample.
  - **Remove voice** deletes the 95 MB.
  - **Privacy**: the voice runs on your PC; nothing is sent anywhere. A line takes about half a second to prepare.
  - **Unusual words**: words the voice doesn't know, such as unusual names in a reminder's title, are sounded out by simple rules, and short all-caps words are spelled. They may now and then sound a little off.
- **Coming next**:
  - 0.19.0: a **Takeover** overlay after 10 minutes, and **This is for work**.
  - 0.20.0: a daily summary.

## Pomodoro timer

From 0.4.0.

- 25-minute focus sessions with 5-minute breaks, and a 15-minute long break after every fourth.
- In the sidebar and the floating list's header. Start a plain session, or press the timer button on a reminder (or **Focus on this**) to focus on that reminder.
- **In the sidebar** (a one-line bar since 0.15.0): a progress ring, the phase and the time left, and a Start/Pause button. Click the bar for the full timer with the reminder it's on, Skip, Reset and today's count; the chevron collapses it. The sidebar remembers which way it was. In the narrow icon strip it's a ring button that starts or pauses, with the time in its tooltip.
- Breaks start by themselves; the next focus session waits for you. A notification and a quiet chime mark each end.
- **Ctrl+Shift+P** starts or pauses it from any app, even while the floating list is locked.
- Each reminder counts its finished sessions, and the timer shows today's total.
- Change the lengths and the chime in **Settings → Focus timer**, and the shortcut in **Settings → Shortcuts**. The timer resets if you quit RemMe.

## Verse of the day

From 0.7.0.

- A Bible verse from the World English Bible (British Edition, with the deuterocanonical books), built into the app, changing at midnight.
- In the sidebar above the timer and at the bottom of the floating list. Turn it off in **Settings → Verse of the day**.
- **In the sidebar** (a one-line bar since 0.15.0): the reference and the start of the verse, with all of it in the tooltip. Click the bar to show the whole verse; click the verse to copy it with its reference; the chevron collapses it. It starts collapsed and stays the way you leave it, even when a new verse arrives. The icon strip hides it.
- **In the floating list** (a one-line bar since 0.16.0): the reference and the start of the verse, like the sidebar. Click the bar to expand it; the chevron collapses it, and it stays the way you leave it. Expanded, drag the line above the verse to resize it, double-click that line to fit the verse, and click the verse to copy it.

## Look and feel

- **Settings** (rewrite; two panes since 0.15.0): the gear icon opens a large dialog with nine sections down the left: General, Appearance, Floating list, Notifications, Focus timer, Verse of the day, Shortcuts, Backups and About.
  - Each setting has at most one short line explaining it.
  - It reopens on the section you used last. The arrow keys, Home and End move between sections.
  - Below 700 px wide, the sections become a row of tabs across the top.
  - **Shortcuts** holds the three global shortcuts (each a button: click it, then press the new keys) and **Restore defaults**. It also lists the keys inside the main window.
- **Themes** (0.4.0; reworked in 0.11.0): pick one in **Settings → Appearance**; it applies at once to both windows.
  - **Windows Fluent** (the default since 0.11.0): Windows colours and your Windows accent colour (used only when it's readable). Follows Windows light or dark mode. On Windows 11 the main window has the see-through Mica background and the floating list Acrylic.
  - **Sharp dark pro**: near-black with an indigo accent (the default before 0.11.0).
  - **Calm minimal**: warm, teal accent, round checkboxes; follows light or dark mode.
  - **Paper and ink**: cream paper, serif headings, hand-drawn-style checkboxes.
- **One layout for every theme** (0.11.0): a Windows 11 style shared by all four (Segoe UI, Fluent icons, the same control sizes and corners). Themes change colours and a few details.
- **Title bar** (0.5.1): the window's title bar takes the theme's colour (on Windows 10, only light or dark).
- **Row spacing** (0.11.0): **Settings → Appearance** switches between **Comfortable** and **Compact**.
- **Accessibility** (0.11.0): everything can be reached with Tab and shows a focus ring. Menus and dialogs close with Esc, and focus stays inside an open dialog. Icon buttons have tooltips. Text colours meet WCAG AA contrast in every theme. Animations switch off when Windows' **Animation effects** is off.
- **Logo** (0.4.0): the RemMe logo, also used for the installer.

## Tray icon and running in the background

- **Tray** (rewrite): closing a window keeps RemMe running in the tray. Left-click the icon to open the app; right-click it for the floating list controls and **Quit**. Only one copy of RemMe runs at a time.
- **Tooltip** (0.13.0): hovering shows how many reminders are due today and overdue, or "Nothing due today".
- **Add reminder…** (0.13.0) in the tray menu opens the main window with a new reminder ready to type (in Today if the current view can't take one).
- **Start with Windows** (rewrite): in Settings; RemMe starts hidden in the tray.

## Backups, export and import

From 0.8.0, in **Settings → Backups**.

- A copy of your reminders from each of the last 7 days and one from each of the 4 weeks before.
- **Back up now** makes one by hand; those stay until you delete them. **Restore** puts a backup back (click twice to confirm).
- **Also back up to…** keeps a second copy of every backup in a folder you choose, such as OneDrive.
- **Export…** saves everything to a file and **Import…** replaces everything with one, for moving to another PC.
- Restoring or importing backs up your current data first, so it can be undone.
- If the reminders file is ever damaged, RemMe loads the newest backup that works and tells you so.

## Updates

From 0.5.0.

- RemMe checks GitHub for a new version when it starts and every 6 hours. A bar at the bottom offers **Update and restart**; your reminders and settings stay.
- **Settings** shows your version and a **Check for updates** button.
- Updates are signed, so only official releases install.

## Keyboard shortcuts

| Where | Keys | What it does | Since |
|---|---|---|---|
| Anywhere in Windows | **Ctrl+Shift+O** | Show or hide the floating list | Rewrite |
| Anywhere in Windows | **Ctrl+Shift+L** | Lock or unlock the floating list | Rewrite |
| Anywhere in Windows | **Ctrl+Shift+P** | Start or pause the Pomodoro timer | 0.4.0 |
| Main window | **Ctrl+N** | New reminder | Rewrite |
| Typing a title | **Enter** | Add the next reminder | Rewrite |
| Typing a title | **Esc** | Stop editing, back to the row | Rewrite (back to the row since 0.14.0) |
| After a change | **Ctrl+Z** | Undo, while the toast shows (outside text boxes) | 0.10.0 |
| A list | **↑** / **↓** | Select the previous or next reminder | 0.14.0 |
| A list | **Home** / **End** | Select the first or last reminder | 0.14.0 |
| A list | **Shift+↑** / **Shift+↓** | Extend the selection | 0.14.0 |
| A list | **Ctrl+click** / **Shift+click** | Add one to the selection / select a range | 0.14.0 |
| A list | **Ctrl+A** | Select all | 0.14.0 |
| A list | **Enter** or **F2** | Edit the selected title | 0.14.0 |
| A list | **Space** | Tick the selected reminders off, or back on | 0.14.0 |
| A list | **Delete** | Delete the selected reminders | 0.14.0 |
| A list | **Ctrl+I** | Open the selected reminder's details | 0.14.0 |
| A list | **Esc** | Clear the selection | 0.14.0 |
| Details panel | **Esc** | Close the panel (outside a text box) | 0.15.0 |
| Details panel edge | **←** / **→** | Make the panel wider or narrower | 0.15.0 |
| Menus and dialogs | **Esc** | Close | 0.11.0 |

The three global shortcuts can be changed in **Settings → Shortcuts**, which also lists the in-app keys.

## Where your data is

- Reminders, lists and settings: `%APPDATA%\com.remme.app\reminders.json`.
- Floating window state and the list of reminders already notified: `ui-state.json` beside it.
- Backups: the `backups` folder beside it.
- Since the rename to RemMe (0.4.0), the first start copies data from the old `%APPDATA%\com.reminders.app\` folder.
- A file that can't be read is renamed to `*.json.corrupt`; for `reminders.json`, the newest readable backup is loaded instead (0.8.0).

## Not yet verified

These were built and tested by simulated input, but not yet seen working on a real machine:

- The tray icon's tooltip and its **Add reminder…** item (Windows draws these; only the code behind them was tested).
- Real mouse drags (reorder, onto a sidebar list) and dragging inside the floating list.
- Real mouse Ctrl+click and Shift+click, and real key presses in the list.
- Selecting cards on the board.
- Light mode of the Fluent and Calm themes, and Windows 10 in general.
- How Mica and Acrylic look on screen, and tooltips appearing on hover.
- Typing into the date and time fields by hand, and opening the row menu from the keyboard (Shift+F10).
- Screen readers.
- The Getting started list on a real new install: it was checked with the data file removed, not from the installer.
- Opening the Snooze submenu with a real mouse.
- Dragging the details panel's edge with a real mouse, and the panel in light themes.
- Recording a new shortcut in the redesigned Settings with real key presses.
- The sidebar's bars in light themes, and the rail's timer button with a real mouse.
- The calendar's ↻ tooltip with a real mouse, and how many chips fit in a month cell on other window sizes.
- Dragging cards between the new shared-width board columns with a real mouse.
- Coach with a real browser on YouTube (tested with Notepad as the distraction; sites are covered by unit tests), the tray's Coach menu and the amber dot (Windows draws these), the Coach popup on a second monitor, and the floating list's Coach button.
- Hearing Coach's voice out loud (checked by measuring the audio: real speech, about 3 seconds per line), a spoken Push from a real off-track stretch with the speakers on, and the voice on slower PCs.

## Planned

- **Coach, the rest** (see [Coach](#coach)):
  - 0.19.0: the Takeover and "This is for work"
  - 0.20.0: the daily summary
- **Later**, each after its own grilling: an Android version, and a free open-source AI that runs on the PC.
