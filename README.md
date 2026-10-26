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

Use **+** to create a note slightly offset from the current one. Use **×** to delete a note; notes containing text require confirmation. Deleting the last note creates a fresh empty note. To close windows while keeping their notes for the next launch, use **Alt+F4** on each window; closing the last window exits the app.

Run the storage tests from the repository root:

```powershell
dotnet test
```

To check multiple-note persistence, create three notes, give each different text and positions, then close each with Alt+F4 and restart the app. All three should return with their text and bounds. Delete one with ×, confirm, and check that it is absent from `notes.json` and after restarting. Delete the remaining notes to check that a fresh empty note replaces the last one.

Each note also remembers its position and size. Move and resize it, close it with Alt+F4, and reopen the app to check that the same bounds are restored. If its saved position is outside every connected screen, it returns to the primary screen. To check recovery, close the app, set `Left` to `-5000` in `notes.json` (beyond your monitor layout), and reopen it.
