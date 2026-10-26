using System.ComponentModel;
using System.IO;
using System.Windows;
using System.Windows.Input;
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

        saveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        saveTimer.Tick += (_, _) =>
        {
            saveTimer.Stop();
            SaveNote();
        };
        NoteTextBox.TextChanged += (_, _) =>
        {
            note.Text = NoteTextBox.Text;
            saveTimer.Stop();
            saveTimer.Start();
        };
    }

    protected override void OnClosing(CancelEventArgs e)
    {
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
