using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;

namespace Reminders;

public partial class NoteWindow : Window
{
    private readonly NotesManager notesManager;
    private readonly Note note;
    private readonly DispatcherTimer saveTimer;
    private bool deleted;

    public NoteWindow(Note note, NotesManager notesManager)
    {
        this.note = note;
        this.notesManager = notesManager;
        InitializeComponent();
        NoteTextBox.Text = note.Text;
        Width = double.IsFinite(note.Width) && note.Width > 0 ? Math.Max(MinWidth, note.Width) : 260;
        Height = double.IsFinite(note.Height) && note.Height > 0 ? Math.Max(MinHeight, note.Height) : 260;
        Left = double.IsFinite(note.Left) ? note.Left : 0;
        Top = double.IsFinite(note.Top) ? note.Top : 0;

        saveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        saveTimer.Tick += (_, _) =>
        {
            saveTimer.Stop();
            notesManager.Save(this);
        };
        NoteTextBox.TextChanged += (_, _) =>
        {
            note.Text = NoteTextBox.Text;
            ScheduleSave();
        };

        Loaded += (_, _) =>
        {
            // Check the native window rectangle so all monitors are considered in
            // physical coordinates, including monitors with different DPI scales.
            if (MonitorFromWindow(new WindowInteropHelper(this).Handle, 0) == IntPtr.Zero)
            {
                var workArea = SystemParameters.WorkArea;
                Width = Math.Min(Width, workArea.Width);
                Height = Math.Min(Height, workArea.Height);
                Left = workArea.Left;
                Top = workArea.Top;
            }

            LocationChanged += (_, _) => SaveGeometry();
            SizeChanged += (_, _) => SaveGeometry();
            SaveGeometry();
        };
    }

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

    private void ScheduleSave()
    {
        saveTimer.Stop();
        saveTimer.Start();
    }

    private void SaveGeometry()
    {
        // Keep the normal bounds if Windows minimizes or maximizes the note.
        if (WindowState != WindowState.Normal)
        {
            return;
        }

        note.Left = Left;
        note.Top = Top;
        note.Width = Width;
        note.Height = Height;
        ScheduleSave();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (!deleted)
        {
            SaveGeometry();
        }

        saveTimer.Stop();
        if (!deleted && !notesManager.Save(this))
        {
            e.Cancel = true;
        }

        base.OnClosing(e);
    }

    private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private void NewNoteButton_Click(object sender, RoutedEventArgs e)
    {
        SaveGeometry();
        notesManager.CreateNote(note, this);
    }

    private void DeleteNoteButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrEmpty(note.Text) &&
            MessageBox.Show(this, "Delete this note?", "Reminders",
                MessageBoxButton.YesNo, MessageBoxImage.Question,
                MessageBoxResult.No) != MessageBoxResult.Yes)
        {
            return;
        }

        saveTimer.Stop();
        if (notesManager.DeleteNote(note, this))
        {
            deleted = true;
            Close();
        }
    }
}
