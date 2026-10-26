using System.IO;
using System.Text.Json;

namespace Reminders;

public sealed class NoteStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string filePath;

    public NoteStore(string? filePath = null)
    {
        this.filePath = filePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Reminders", "notes.json");
    }

    public List<Note> Load()
    {
        try
        {
            var notes = JsonSerializer.Deserialize<List<Note?>>(File.ReadAllText(filePath), JsonOptions);
            return notes?.OfType<Note>().ToList() ?? [];
        }
        catch (FileNotFoundException)
        {
            return [];
        }
        catch (DirectoryNotFoundException)
        {
            return [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public void Save(IReadOnlyList<Note> notes)
    {
        var json = JsonSerializer.Serialize(notes, JsonOptions);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(filePath))!);
        File.WriteAllText(filePath, json);
    }
}
