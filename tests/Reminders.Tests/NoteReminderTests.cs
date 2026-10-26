using Xunit;

namespace Reminders.Tests;

public sealed class NoteReminderTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 26, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void NoteWithoutReminderIsNotDue()
    {
        Assert.False(new Note().IsDue(Now));
    }

    [Theory]
    [InlineData(-1, true)]
    [InlineData(0, true)]
    [InlineData(1, false)]
    public void ReminderIsDueAtOrAfterItsTime(int secondsFromNow, bool expected)
    {
        var note = new Note { DueAt = Now.AddSeconds(secondsFromNow) };
        Assert.Equal(expected, note.IsDue(Now));
    }

    [Fact]
    public void DueComparisonUsesTheInstantAcrossTimeZoneOffsets()
    {
        var note = new Note { DueAt = Now.ToOffset(TimeSpan.FromHours(8)) };
        Assert.True(note.IsDue(Now));
        Assert.False(note.IsDue(Now.AddSeconds(-1)));
    }

    [Fact]
    public void ClearedReminderIsNoLongerDue()
    {
        var note = new Note { DueAt = Now.AddMinutes(-1) };
        Assert.True(note.IsDue(Now));
        note.DueAt = null;
        Assert.False(note.IsDue(Now));
    }
}
