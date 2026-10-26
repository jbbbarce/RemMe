namespace Reminders;

public sealed class Note
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Text { get; set; } = string.Empty;
    public double Left { get; set; }
    public double Top { get; set; }
    public double Width { get; set; } = 260;
    public double Height { get; set; } = 260;
    public string Color { get; set; } = "#FFF475";
}
