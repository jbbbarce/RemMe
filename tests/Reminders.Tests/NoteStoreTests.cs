using Xunit;

namespace Reminders.Tests;

public sealed class NoteStoreTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "Reminders.Tests", Guid.NewGuid().ToString());
    private string FilePath => Path.Combine(directory, "nested", "notes.json");

    [Fact]
    public void SaveAndLoadRoundTripPreservesAllNoteFields()
    {
        var first = new Note
        {
            Id = Guid.NewGuid(), Text = "Remember milk\nAnd tea ☕", Left = 42.5, Top = 71,
            Width = 320, Height = 280, Color = "#F8BBD0"
        };
        var second = new Note { Text = "Another note", Color = "#B3E5FC" };
        new NoteStore(FilePath).Save([first, second]);

        var loaded = new NoteStore(FilePath).Load();

        Assert.Equal(2, loaded.Count);
        Assert.Equal(first.Id, loaded[0].Id);
        Assert.Equal(first.Text, loaded[0].Text);
        Assert.Equal(first.Left, loaded[0].Left);
        Assert.Equal(first.Top, loaded[0].Top);
        Assert.Equal(first.Width, loaded[0].Width);
        Assert.Equal(first.Height, loaded[0].Height);
        Assert.Equal(first.Color, loaded[0].Color);
        Assert.Equal(second.Id, loaded[1].Id);
        Assert.Equal(second.Text, loaded[1].Text);
        Assert.Equal(second.Color, loaded[1].Color);
    }

    [Fact]
    public void SavingEditsAndDeletionKeepsOtherNotes()
    {
        var store = new NoteStore(FilePath);
        var first = new Note { Text = "First", Left = 50, Top = 60 };
        var second = new Note { Text = "Second", Left = 100, Top = 120 };
        var third = new Note { Text = "Third", Left = 150, Top = 180 };
        store.Save([first, second, third]);

        var notes = store.Load();
        notes[0].Text = "Edited first";
        notes[2].Width = 350;
        notes.RemoveAt(1);
        store.Save(notes);

        var restored = new NoteStore(FilePath).Load();
        Assert.Equal(new[] { first.Id, third.Id }, restored.Select(note => note.Id));
        Assert.Equal("Edited first", restored[0].Text);
        Assert.Equal("Third", restored[1].Text);
        Assert.Equal(150, restored[1].Left);
        Assert.Equal(180, restored[1].Top);
        Assert.Equal(350, restored[1].Width);
        Assert.DoesNotContain(restored, note => note.Id == second.Id);
    }

    [Fact]
    public void LoadMissingFileReturnsEmptyList()
    {
        Assert.Empty(new NoteStore(FilePath).Load());
    }

    [Theory]
    [InlineData("{broken json")]
    [InlineData("")]
    [InlineData("{}")]
    [InlineData("null")]
    [InlineData("[null]")]
    public void LoadCorruptOrEmptyFileReturnsEmptyList(string contents)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        File.WriteAllText(FilePath, contents);
        var store = new NoteStore(FilePath);

        Assert.Empty(store.Load());

        store.Save([new Note { Text = "Recovered" }]);
        Assert.Equal("Recovered", Assert.Single(store.Load()).Text);
    }

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
