using System.IO;
using System.Windows;

namespace Reminders;

public partial class App : Application
{
    private NotesManager? notesManager;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        notesManager = new NotesManager();
        notesManager.OpenNotes();
    }
}

public sealed class NotesManager
{
    private readonly NoteStore noteStore = new();
    private readonly List<Note> notes;

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
        new NoteWindow(note, this).Show();
    }

    public void CreateNote(Note source, Window owner)
    {
        var note = new Note { Left = source.Left + 24, Top = source.Top + 24 };
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
        Note? replacement = null;
        if (notes.Count == 0)
        {
            replacement = new Note { Left = note.Left, Top = note.Top };
            notes.Add(replacement);
        }

        if (!Save(owner))
        {
            if (replacement is not null)
            {
                notes.Remove(replacement);
            }

            notes.Insert(index, note);
            return false;
        }

        // Open the replacement before closing the last window, so WPF stays running.
        if (replacement is not null)
        {
            OpenWindow(replacement);
        }

        return true;
    }

    public bool Save(Window owner)
    {
        try
        {
            noteStore.Save(notes);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            MessageBox.Show(owner, $"Could not save your notes.\n{ex.Message}",
                "Reminders", MessageBoxButton.OK, MessageBoxImage.Error);
            return false;
        }
    }
}
