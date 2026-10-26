# Reminders

A Windows WPF app with a 260 × 260 yellow window that stays on top of other windows.

Requires Windows and the .NET 10 SDK (LTS). A runtime alone is not enough to build the app.

From the repository root, build and run:

```powershell
dotnet build
dotnet run --project src/Reminders
```

To check the window, launch the app and click another application. The yellow Reminders window should remain above it. Close the window to exit.

Type in the note to edit it. Text saves automatically after 500 ms without typing and when the window closes, to `%APPDATA%\Reminders\notes.json`. Reopen the app to restore the text. Missing or corrupt note files start with an empty note.

Run the storage tests from the repository root:

```powershell
dotnet test
```

To check persistence manually, type a few lines, close the window immediately, and reopen it. The text should be restored.
