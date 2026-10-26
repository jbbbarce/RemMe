# Reminders

A Windows WPF app with a 260 × 260 yellow window that stays on top of other windows.

Requires Windows and the .NET 10 SDK (LTS). A runtime alone is not enough to build the app.

From the repository root, build and run:

```powershell
dotnet build
dotnet run --project src/Reminders
```

To check the window, launch the app and click another application. The yellow Reminders window should remain above it.

Type in a note to edit it. All notes save automatically after 500 ms without typing or moving/resizing and when a window closes, to `%APPDATA%\Reminders\notes.json`. Reopen the app to restore all notes. Missing or corrupt note files start with an empty note.

Use **+** to create a note slightly offset from the current one. Use **×** to delete a note; notes containing text require confirmation. Deleting the last note leaves the app running in the system tray. **Alt+F4** hides a note while keeping it saved.

Right-click the Reminders tray icon (it may be in Windows' hidden icons area) for **New note**, **Show all notes**, **Hide all notes**, and **Exit**. Double-click the icon to show all notes. Exit saves pending changes and quits the app; hiding or deleting notes keeps the tray icon available. Visible notes reapply their always-on-top setting every two seconds.

Use the small color circle in a note's header to choose yellow, pink, green, blue, purple, or orange. Each note keeps its own color, with a darker header in the same shade. To check persistence, choose different colors for two notes, use Exit from the tray, and restart the app; both colors should return.

Use the alarm-clock button to set a reminder date and local time in 24-hour `HH:mm` format, or choose Clear to remove it. The due time appears in the header. Reminders are checked every 30 seconds and on startup, so a reminder can appear up to 30 seconds after its due time. When due, even a hidden note appears in front, flashes its header, and repeats the system notification sound until you click the note. Clicking clears and saves the reminder.

To check reminders, set one about a minute ahead and hide its note from the tray. Wait until it appears, flashes, and sounds, then click it. Exit and restart the app to check that the acknowledged reminder stays cleared. You can also set a future reminder, restart before it is due, and check that its header time is restored. The app must be running for reminders to alert; overdue reminders alert when the app starts.

Run the storage and reminder tests from the repository root:

```powershell
dotnet test
```

To check multiple-note persistence, create three notes, give each different text and positions, then use Exit from the tray and restart the app. All three should return with their text and bounds. Delete one with ×, confirm, and check that it is absent from `notes.json` and after restarting. Delete the remaining notes to check that the tray stays available, then use New note to create another.

Each note also remembers its position and size. Move and resize it, use Exit from the tray, and reopen the app to check that the same bounds are restored. If its saved position is outside every connected screen, it returns to the primary screen. To check recovery, exit the app, set `Left` to `-5000` in `notes.json` (beyond your monitor layout), and reopen it.

To check the tray controls, hide all notes and verify that they stay hidden for more than two seconds, show them again, and create a note from the tray. Click a maximized browser and the taskbar; visible notes should return above ordinary windows within two seconds without unhiding hidden notes. Finally, edit a note and immediately use Exit; the icon should disappear and the edit should return after restarting.
