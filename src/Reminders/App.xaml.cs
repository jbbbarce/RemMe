using System.IO;
using System.Windows;
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
        foreach (var window in windows.Values)
        {
            if (window.IsVisible && window.WindowState != WindowState.Minimized)
            {
                window.Topmost = false;
                window.Topmost = true;
            }
        }
    }

    public void Exit()
    {
        foreach (var window in windows.Values)
        {
            window.PrepareForExit();
        }

        if (Save())
        {
            IsExiting = true;
            Application.Current.Shutdown();
        }
    }

    public bool Save(Window? owner = null)
    {
        try
        {
            noteStore.Save(notes);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
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
