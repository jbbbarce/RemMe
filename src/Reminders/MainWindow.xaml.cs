using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;

namespace Reminders;

public partial class MainWindow : Window
{
    private readonly NoteStore noteStore = new();
    private readonly List<Note> notes;
    private readonly Note note;
    private readonly DispatcherTimer saveTimer;

    public MainWindow()
    {
        notes = noteStore.Load();
        if (notes.Count == 0)
        {
            notes.Add(new Note());
        }

        note = notes[0];
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
            SaveNote();
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
        SaveGeometry();
        saveTimer.Stop();
        if (!SaveNote())
        {
            e.Cancel = true;
        }

        base.OnClosing(e);
    }

    private bool SaveNote()
    {
        try
        {
            noteStore.Save(notes);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            MessageBox.Show(this, $"Could not save your note.\n{ex.Message}",
                "Reminders", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }

    private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
