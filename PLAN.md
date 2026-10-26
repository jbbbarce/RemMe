# Plan: Personal sticky-note reminders app for Windows that always stays on top of other windows

- [x] 1. Scaffold WPF app with an always-on-top window
  Create a .NET WPF app (`dotnet new wpf -n Reminders -o src/Reminders`, targeting the newest installed LTS SDK, e.g. net8.0-windows or net10.0-windows) plus a solution file `Reminders.sln` at the repo root and a standard .NET `.gitignore`. Set the main window to `Topmost="True"`, about 260x260, sticky-note yellow background (#FFF475), title "Reminders". Add a short README.md with build/run instructions. Check: `dotnet build` succeeds; `dotnet run --project src/Reminders` opens a yellow window that stays above other windows when you click on another app.

- [x] 2. Make the window look and behave like a sticky note
  Set `WindowStyle="None"`, `ResizeMode="CanResizeWithGrip"`, `ShowInTaskbar="False"`, and add a slim header bar (slightly darker yellow) that lets you drag the note with `DragMove()` on mouse-down, plus a "×" close button on the right of the header. Check: the note has no standard title bar, can be dragged by the header, resized from the corner grip, closed with ×, and still stays on top.

- [ ] 3. Add editable note text with autosave
  Fill the body with a borderless, transparent, multi-line `TextBox` (wrapping, AcceptsReturn, comfortable font such as Segoe Print or Segoe UI 14). Add a `Note` model (Id, Text, Left, Top, Width, Height, Color) and a `NoteStore` class that loads/saves a list of notes as JSON in `%APPDATA%\Reminders\notes.json` (System.Text.Json; create folder if missing; tolerate a missing or corrupt file by starting empty). Save on text change (debounced ~500 ms) and on close. Add an xUnit test project `tests/Reminders.Tests` covering save/load round-trip and corrupt-file handling. Check: `dotnet test` passes; type text, close the app, reopen it, and the text is restored.

- [ ] 4. Remember each note's position and size
  Save Left/Top/Width/Height to the note when the window is moved or resized (on `LocationChanged`/`SizeChanged`, through the same debounced save). On load, restore them, and if the saved position is off every current screen (e.g. monitor unplugged) move the note back onto the primary screen. Check: move and resize the note, restart, it reappears in the same place and size; edit the JSON to put it at Left=-5000 and it comes back on-screen.

- [ ] 5. Support multiple notes
  Move window creation into an app-level `NotesManager` (in App.xaml.cs) that opens one `NoteWindow` per saved note, or one empty note if none exist. Add a "+" button in the header that creates a new note offset slightly from the current one. Change "×" to delete the note (with a confirm dialog if it has text); the app exits when the last note is deleted only via the tray in a later step, so for now deleting the last note creates a fresh empty one. Check: create three notes, edit each, restart — all three come back with correct text and positions; deleting one removes it from notes.json.

- [ ] 6. Add per-note colors
  Add a small color button in the header that opens a menu of 5–6 sticky colors (yellow, pink, green, blue, purple, orange); header uses a darker shade of the same color. Store the color in the note. Check: change colors on two notes, restart, colors are kept.

- [ ] 7. Add tray icon and keep notes on top reliably
  Add a system tray icon (WinForms `NotifyIcon` via `<UseWindowsForms>true</UseWindowsForms>`, or the H.NotifyIcon.Wpf package) with menu items: New note, Show all notes, Hide all notes, Exit. Set `ShutdownMode="OnExplicitShutdown"` so the app only exits from the tray. Because some apps (full-screen windows, the taskbar) can push topmost windows down, add a lightweight timer (every ~2 s) or `Deactivated` handler that re-applies `Topmost` to visible notes. Check: tray icon appears; hide/show/new/exit work; notes stay above a maximized browser and after clicking the taskbar.

- [ ] 8. Add optional reminder time per note
  Add an alarm-clock button in the header that lets you set a due date/time (simple dialog with DatePicker + time text box, and a "clear" option); store `DueAt` in the note and show it as small text in the header. A `DispatcherTimer` (every 30 s) checks for due notes: when due, the note is shown (if hidden), brought to front, flashes its border/header, and plays the system notification sound until clicked; then `DueAt` is cleared. Add unit tests for the "is due" logic. Check: `dotnet test` passes; set a reminder 1 minute ahead, the note flashes and beeps at that time, clicking it stops the alert, restart shows no reminder.

- [ ] 9. Add "Start with Windows" option and a publish script
  Add a checkable "Start with Windows" tray menu item that adds/removes a value under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` pointing to the running exe. Add `publish.ps1` that runs `dotnet publish src/Reminders -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o publish`, add `publish/` to .gitignore, and document it in README.md. Check: run publish.ps1, launch the exe from `publish/`, enable "Start with Windows", sign out and back in — notes appear on top automatically; disabling it removes the registry value.
