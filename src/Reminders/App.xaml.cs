using System.IO;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace Reminders;

public partial class App : Application
{
    private NotesManager? notesManager;
    private Forms.NotifyIcon? trayIcon;
    private Forms.ContextMenuStrip? trayMenu;
    private DispatcherTimer? topmostTimer;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        notesManager = new NotesManager();
        trayMenu = new Forms.ContextMenuStrip();
        trayMenu.Items.Add("New note", null, (_, _) => notesManager.CreateNote());
        trayMenu.Items.Add("Show all notes", null, (_, _) => notesManager.ShowAll());
        trayMenu.Items.Add("Hide all notes", null, (_, _) => notesManager.HideAll());
        trayMenu.Items.Add(new Forms.ToolStripSeparator());
        trayMenu.Items.Add("Exit", null, (_, _) => notesManager.Exit());
        trayIcon = new Forms.NotifyIcon
        {
            Text = "Reminders",
            Icon = System.Drawing.SystemIcons.Application,
            ContextMenuStrip = trayMenu,
            Visible = true
        };
        trayIcon.DoubleClick += (_, _) => notesManager.ShowAll();
        notesManager.OpenNotes();

        topmostTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        topmostTimer.Tick += (_, _) => notesManager.KeepOnTop();
        topmostTimer.Start();
    }

    protected override void OnSessionEnding(SessionEndingCancelEventArgs e)
    {
        notesManager?.PrepareAndSave(sessionEnding: true);
        base.OnSessionEnding(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        topmostTimer?.Stop();
        if (trayIcon is not null)
        {
            trayIcon.Visible = false;
            trayIcon.Dispose();
        }

        trayMenu?.Dispose();
        base.OnExit(e);
    }
}

public sealed class NotesManager
{
    private readonly NoteStore noteStore = new();
    private readonly List<Note> notes;
    private readonly Dictionary<Note, NoteWindow> windows = new();

    public bool IsExiting { get; private set; }

    public NotesManager()
    {
        notes = noteStore.Load();
        if (notes.Count == 0)
        {
            notes.Add(new Note());
        }
    }

    public void OpenNotes()
    {
        foreach (var note in notes)
        {
            OpenWindow(note);
        }
    }

    private void OpenWindow(Note note)
    {
        var window = new NoteWindow(note, this);
        windows.Add(note, window);
        window.Closed += (_, _) => windows.Remove(note);
        window.Show();
    }

    public void CreateNote(Note? source = null, Window? owner = null)
    {
        source ??= notes.LastOrDefault();
        var note = new Note
        {
            Left = source is null ? 0 : source.Left + 24,
            Top = source is null ? 0 : source.Top + 24
        };
        notes.Add(note);
        if (!Save(owner))
        {
            notes.Remove(note);
            return;
        }

        OpenWindow(note);
    }

    public bool DeleteNote(Note note, Window owner)
    {
        var index = notes.IndexOf(note);
        if (index < 0)
        {
            return false;
        }

        notes.RemoveAt(index);
        if (!Save(owner))
        {
            notes.Insert(index, note);
            return false;
        }

        return true;
    }

    public void ShowAll()
    {
        foreach (var note in notes)
        {
            if (windows.TryGetValue(note, out var window))
            {
                if (window.WindowState == WindowState.Minimized)
                {
                    window.WindowState = WindowState.Normal;
                }

                window.Show();
            }
            else
            {
                OpenWindow(note);
            }
        }

        KeepOnTop();
    }

    public void HideAll()
    {
        foreach (var window in windows.Values)
        {
            window.Hide();
        }
    }

    public void KeepOnTop()
    {
        var visibleHandles = windows.Values
            .Where(window => window.IsVisible && window.WindowState != WindowState.Minimized)
            .Select(window => new WindowInteropHelper(window).Handle)
            .Where(handle => handle != IntPtr.Zero)
            .ToHashSet();
        var frontToBack = new List<IntPtr>();
        NativeMethods.EnumWindows((hwnd, _) =>
        {
            if (visibleHandles.Contains(hwnd))
            {
                frontToBack.Add(hwnd);
            }

            return true;
        }, IntPtr.Zero);

        // Raise the back note first, preserving the user's current note order.
        for (var index = frontToBack.Count - 1; index >= 0; index--)
        {
            NativeMethods.SetWindowPos(frontToBack[index], NativeMethods.HwndTopmost,
                0, 0, 0, 0,
                NativeMethods.SwpNoMove | NativeMethods.SwpNoSize | NativeMethods.SwpNoActivate);
        }
    }

    public void Exit()
    {
        if (PrepareAndSave())
        {
            Application.Current.Shutdown();
        }
    }

    public bool PrepareAndSave(bool sessionEnding = false)
    {
        foreach (var window in windows.Values)
        {
            window.PrepareForExit();
        }

        var saved = Save(showErrors: !sessionEnding);
        if (saved || sessionEnding)
        {
            IsExiting = true;
        }

        return saved;
    }

    public bool Save(Window? owner = null, bool showErrors = true)
    {
        try
        {
            noteStore.Save(notes);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            if (!showErrors)
            {
                return false;
            }

            var message = $"Could not save your notes.\n{ex.Message}";
            if (owner is not null)
            {
                MessageBox.Show(owner, message, "Reminders", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            else
            {
                MessageBox.Show(message, "Reminders", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            return false;
        }
    }
}
