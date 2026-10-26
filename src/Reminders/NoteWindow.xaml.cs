using System.ComponentModel;
using System.Media;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

namespace Reminders;

public partial class NoteWindow : Window
{
    private readonly NotesManager notesManager;
    private readonly Note note;
    private readonly DispatcherTimer saveTimer;
    private readonly DispatcherTimer alertTimer = new() { Interval = TimeSpan.FromMilliseconds(500) };
    private Brush normalHeaderBrush = Brushes.Transparent;
    private int alertTicks;
    private bool deleted;

    public NoteWindow(Note note, NotesManager notesManager)
    {
        this.note = note;
        this.notesManager = notesManager;
        InitializeComponent();
        ApplyColor(note.Color);
        UpdateDueDisplay();
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

        alertTimer.Tick += (_, _) =>
        {
            alertTicks++;
            HeaderBar.Background = alertTicks % 2 == 0 ? Brushes.OrangeRed : normalHeaderBrush;
            if (alertTicks % 4 == 0)
            {
                SystemSounds.Exclamation.Play();
            }
        };
        PreviewMouseDown += (_, _) => AcknowledgeReminder();
        Closed += (_, _) =>
        {
            saveTimer.Stop();
            alertTimer.Stop();
        };

        var initialized = false;
        Loaded += (_, _) =>
        {
            if (initialized)
            {
                return;
            }

            initialized = true;
            // Check the native window rectangle so all monitors are considered in
            // physical coordinates, including monitors with different DPI scales.
            if (NativeMethods.MonitorFromWindow(new WindowInteropHelper(this).Handle, 0) == IntPtr.Zero)
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
        if (!deleted && !notesManager.IsExiting)
        {
            e.Cancel = true;
            if (notesManager.Save(this))
            {
                Hide();
            }
        }

        base.OnClosing(e);
    }

    public void PrepareForExit()
    {
        SaveGeometry();
        saveTimer.Stop();
        StopAlert();
    }

    public void StartReminder()
    {
        if (alertTimer.IsEnabled)
        {
            return;
        }

        if (WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Normal;
        }

        Show();
        NativeMethods.SetWindowPos(new WindowInteropHelper(this).Handle, NativeMethods.HwndTopmost,
            0, 0, 0, 0, NativeMethods.SwpNoMove | NativeMethods.SwpNoSize | NativeMethods.SwpNoActivate);
        alertTicks = 0;
        HeaderBar.Background = Brushes.OrangeRed;
        alertTimer.Start();
        SystemSounds.Exclamation.Play();
    }

    private void StopAlert()
    {
        alertTimer.Stop();
        HeaderBar.Background = normalHeaderBrush;
    }

    private void AcknowledgeReminder()
    {
        if (!alertTimer.IsEnabled)
        {
            return;
        }

        StopAlert();
        note.DueAt = null;
        UpdateDueDisplay();
        saveTimer.Stop();
        notesManager.Save(this);
    }

    private void UpdateDueDisplay()
    {
        DueText.Text = note.DueAt?.LocalDateTime.ToString("MM/dd HH:mm") ?? string.Empty;
        DueText.ToolTip = note.DueAt?.LocalDateTime.ToString("f");
    }

    private void ReminderButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new ReminderDialog(note.DueAt) { Owner = this };
        if (dialog.ShowDialog() == true)
        {
            StopAlert();
            note.DueAt = dialog.DueAt;
            UpdateDueDisplay();
            saveTimer.Stop();
            notesManager.Save(this);
        }
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

    private void ColorButton_Click(object sender, RoutedEventArgs e)
    {
        ColorMenu.PlacementTarget = ColorButton;
        ColorMenu.Placement = PlacementMode.Bottom;
        ColorMenu.IsOpen = true;
    }

    private void ColorMenuItem_Click(object sender, RoutedEventArgs e)
    {
        ApplyColor((string)((MenuItem)sender).Tag);
        ScheduleSave();
    }

    private void ApplyColor(string? color)
    {
        // Only use palette values; older or manually edited files may have an
        // unknown color, in which case the note returns to yellow.
        var items = ColorMenu.Items.Cast<MenuItem>().ToList();
        var selected = items.FirstOrDefault(item =>
            string.Equals((string)item.Tag, color, StringComparison.OrdinalIgnoreCase)) ?? items[0];
        note.Color = (string)selected.Tag;
        var background = (Color)ColorConverter.ConvertFromString(note.Color);
        Background = new SolidColorBrush(background);
        ColorSwatch.Fill = Background;
        normalHeaderBrush = new SolidColorBrush(Color.FromRgb(
            (byte)(background.R * 0.9), (byte)(background.G * 0.9), (byte)(background.B * 0.9)));
        HeaderBar.Background = normalHeaderBrush;

        foreach (var item in items)
        {
            item.IsChecked = item == selected;
        }
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
