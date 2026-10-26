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
            Width = 320, Height = 280, Color = "#FFF475"
        };
        var second = new Note { Text = "Another note" };
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
