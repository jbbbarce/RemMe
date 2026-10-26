using System.Globalization;
using System.Windows;

namespace Reminders;

public partial class ReminderDialog : Window
{
    public DateTimeOffset? DueAt { get; private set; }

    public ReminderDialog(DateTimeOffset? dueAt)
    {
        InitializeComponent();
        var localTime = dueAt?.LocalDateTime ?? DateTime.Now.AddMinutes(1);
        ReminderDate.SelectedDate = localTime.Date;
        ReminderTime.Text = localTime.ToString("HH:mm", CultureInfo.InvariantCulture);
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (ReminderDate.SelectedDate is not { } date ||
            !TimeSpan.TryParseExact(ReminderTime.Text.Trim(), @"hh\:mm",
                CultureInfo.InvariantCulture, out var time) || time.TotalHours >= 24)
        {
            ValidationMessage.Text = "Choose a date and enter a time such as 14:30.";
            return;
        }

        var localTime = DateTime.SpecifyKind(date.Date + time, DateTimeKind.Unspecified);
        if (TimeZoneInfo.Local.IsInvalidTime(localTime))
        {
            ValidationMessage.Text = "This time is skipped by the daylight saving change. Choose another time.";
            return;
        }

        DueAt = new DateTimeOffset(localTime, TimeZoneInfo.Local.GetUtcOffset(localTime));
        DialogResult = true;
    }

    private void Clear_Click(object sender, RoutedEventArgs e)
    {
        DueAt = null;
        DialogResult = true;
    }
}
