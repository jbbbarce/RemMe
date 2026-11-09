//! Copies of `reminders.json`: daily ones, ones made before a restore or import, and ones made by hand.
//! A backup's kind and time are in its file name, which is also how old ones are found and pruned.

use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use serde::Serialize;
use serde_json::Value;

/// The folder inside the app data folder, and inside a chosen second folder.
pub const LOCAL_DIR: &str = "backups";
pub const SECOND_DIR: &str = "RemMe backups";

const PREFIX: &str = "reminders-";
const DAILY_KEPT: usize = 7;
const WEEKLY_KEPT: i64 = 4;
const SAFETY_KEPT: usize = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Daily,
    Manual,
    BeforeRestore,
    BeforeImport,
}

impl Kind {
    fn slug(self) -> &'static str {
        match self {
            Kind::Daily => "daily",
            Kind::Manual => "manual",
            Kind::BeforeRestore => "before-restore",
            Kind::BeforeImport => "before-import",
        }
    }

    fn from_slug(slug: &str) -> Option<Kind> {
        [Kind::Daily, Kind::Manual, Kind::BeforeRestore, Kind::BeforeImport]
            .into_iter()
            .find(|kind| kind.slug() == slug)
    }

    fn is_safety(self) -> bool {
        matches!(self, Kind::BeforeRestore | Kind::BeforeImport)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Backup {
    pub path: PathBuf,
    pub name: String,
    pub kind: Kind,
    pub taken: NaiveDateTime,
}

/// `reminders-2026-11-09-091405-daily.json`
pub fn file_name(taken: NaiveDateTime, kind: Kind) -> String {
    format!("{PREFIX}{}-{}.json", taken.format("%Y-%m-%d-%H%M%S"), kind.slug())
}

fn parse_name(name: &str) -> Option<(NaiveDateTime, Kind)> {
    let rest = name.strip_prefix(PREFIX)?.strip_suffix(".json")?;
    // "2026-11-09-091405" is 17 characters, then "-" and the kind.
    let (stamp, kind) = (rest.get(..17)?, rest.get(17..)?.strip_prefix('-')?);
    let taken = NaiveDateTime::parse_from_str(stamp, "%Y-%m-%d-%H%M%S").ok()?;
    Some((taken, Kind::from_slug(kind)?))
}

/// Every backup in `dir`, newest first. Files RemMe didn't name are ignored.
pub fn list(dir: &Path) -> Vec<Backup> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut backups: Vec<Backup> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let (taken, kind) = parse_name(&name)?;
            Some(Backup { path: entry.path(), name, kind, taken })
        })
        .collect();
    backups.sort_by(|a, b| b.taken.cmp(&a.taken).then_with(|| b.name.cmp(&a.name)));
    backups
}

/// Whether a value looks like RemMe data: an object with `lists` and `tasks` arrays.
pub fn is_data(value: &Value) -> bool {
    value["lists"].is_array() && value["tasks"].is_array()
}

/// Reads a file as RemMe data, or `None` if it can't be read or isn't RemMe data.
pub fn read_data(path: &Path) -> Option<Value> {
    let value: Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    is_data(&value).then_some(value)
}

/// Writes `text` as a new backup in `dir`, creating the folder if needed.
pub fn write(dir: &Path, text: &str, kind: Kind, now: NaiveDateTime) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let path = dir.join(file_name(now, kind));
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, text)
        .and_then(|_| fs::rename(&temp, &path))
        .map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(path)
}

/// Whether `dir` still needs today's daily backup.
pub fn needs_daily(dir: &Path, today: NaiveDate) -> bool {
    !list(dir).iter().any(|b| b.kind == Kind::Daily && b.taken.date() == today)
}

/// Monday of the week `day` is in.
fn week_start(day: NaiveDate) -> NaiveDate {
    day - Duration::days(day.weekday().num_days_from_monday() as i64)
}

/// The backups pruning would delete: daily ones beyond the newest 7 that aren't the newest of
/// one of the 4 weeks before this one, and safety ones beyond the newest 5. Manual ones stay.
pub fn to_prune(backups: &[Backup], today: NaiveDate) -> Vec<Backup> {
    let daily: Vec<&Backup> = backups.iter().filter(|b| b.kind == Kind::Daily).collect();
    let this_week = week_start(today);
    let weekly: Vec<&Backup> = (1..=WEEKLY_KEPT)
        .filter_map(|weeks_back| {
            let start = this_week - Duration::weeks(weeks_back);
            let end = start + Duration::weeks(1);
            daily.iter().copied().find(|b| b.taken.date() >= start && b.taken.date() < end)
        })
        .collect();
    let mut gone: Vec<Backup> = daily
        .iter()
        .skip(DAILY_KEPT)
        .filter(|b| !weekly.contains(b))
        .map(|b| (*b).clone())
        .collect();
    gone.extend(backups.iter().filter(|b| b.kind.is_safety()).skip(SAFETY_KEPT).cloned());
    gone
}

pub fn prune(dir: &Path, today: NaiveDate) {
    for backup in to_prune(&list(dir), today) {
        let _ = fs::remove_file(&backup.path);
    }
}

/// The newest backup in `dir` that reads as RemMe data, skipping damaged ones.
pub fn newest_readable(dir: &Path) -> Option<(Backup, Value)> {
    list(dir).into_iter().find_map(|backup| read_data(&backup.path).map(|data| (backup, data)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M").unwrap()
    }

    fn backup(text: &str, kind: Kind) -> Backup {
        let taken = at(text);
        let name = file_name(taken, kind);
        Backup { path: PathBuf::from(&name), name, kind, taken }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("remme-backup-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn names_round_trip() {
        let name = file_name(at("2026-11-09 09:14"), Kind::BeforeRestore);
        assert_eq!(name, "reminders-2026-11-09-091400-before-restore.json");
        assert_eq!(parse_name(&name), Some((at("2026-11-09 09:14"), Kind::BeforeRestore)));
        assert_eq!(parse_name("reminders.json"), None);
        assert_eq!(parse_name("reminders-2026-11-09-091400-other.json"), None);
        assert_eq!(parse_name("notes-2026-11-09-091400-daily.json"), None);
    }

    #[test]
    fn keeps_seven_daily_and_four_weekly() {
        // Monday 9 Nov 2026. One daily backup a day for six weeks before it.
        let today = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let backups: Vec<Backup> = (0..42)
            .map(|days_back| {
                let day = today - Duration::days(days_back);
                backup(&format!("{} 08:00", day.format("%Y-%m-%d")), Kind::Daily)
            })
            .collect();
        let mut sorted = backups.clone();
        sorted.sort_by(|a, b| b.taken.cmp(&a.taken));
        let gone = to_prune(&sorted, today);
        let kept: Vec<String> = sorted
            .iter()
            .filter(|b| !gone.contains(b))
            .map(|b| b.taken.format("%m-%d").to_string())
            .collect();
        // The newest 7 (9 Nov back to 3 Nov), then the newest of each of the 4 weeks before this one
        // (weeks start on Monday): 8 Nov is already kept, then the Sundays 1 Nov, 25 Oct and 18 Oct.
        assert_eq!(kept, ["11-09", "11-08", "11-07", "11-06", "11-05", "11-04", "11-03", "11-01", "10-25", "10-18"]);
    }

    #[test]
    fn keeps_five_safety_backups_and_every_manual_one() {
        let today = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        let mut backups: Vec<Backup> = (0..8)
            .map(|i| backup(&format!("2026-11-0{} 10:00", i + 1), if i % 2 == 0 { Kind::BeforeRestore } else { Kind::BeforeImport }))
            .chain((0..9).map(|i| backup(&format!("2026-10-0{} 10:00", i + 1), Kind::Manual)))
            .collect();
        backups.sort_by(|a, b| b.taken.cmp(&a.taken));
        let gone = to_prune(&backups, today);
        assert_eq!(gone.len(), 3);
        assert!(gone.iter().all(|b| b.kind.is_safety() && b.taken < at("2026-11-04 00:00")));
    }

    #[test]
    fn daily_backup_is_needed_once_a_day() {
        let dir = temp_dir("daily");
        let today = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        assert!(needs_daily(&dir, today));
        write(&dir, "{}", Kind::Manual, at("2026-11-09 07:00")).unwrap();
        assert!(needs_daily(&dir, today), "a manual backup doesn't count as the daily one");
        write(&dir, "{}", Kind::Daily, at("2026-11-09 07:30")).unwrap();
        assert!(!needs_daily(&dir, today));
        assert!(needs_daily(&dir, today + Duration::days(1)));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pruning_leaves_other_files_alone() {
        let dir = temp_dir("prune");
        let today = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap();
        for day in 1..=9 {
            write(&dir, "{}", Kind::Daily, at(&format!("2026-11-0{day} 08:00"))).unwrap();
        }
        fs::write(dir.join("notes.txt"), "mine").unwrap();
        prune(&dir, today);
        assert_eq!(list(&dir).len(), 8, "7 newest plus 1 Nov as last week's newest");
        assert!(dir.join("notes.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn recovery_skips_damaged_backups() {
        let dir = temp_dir("recover");
        assert!(newest_readable(&dir).is_none());
        write(&dir, r#"{"lists":[],"tasks":[{"id":"a"}]}"#, Kind::Daily, at("2026-11-07 08:00")).unwrap();
        write(&dir, "{ not json", Kind::Daily, at("2026-11-08 08:00")).unwrap();
        write(&dir, r#"{"something":"else"}"#, Kind::Manual, at("2026-11-09 08:00")).unwrap();
        let (found, data) = newest_readable(&dir).unwrap();
        assert_eq!(found.taken, at("2026-11-07 08:00"));
        assert_eq!(data["tasks"][0]["id"], "a");
        let _ = fs::remove_dir_all(&dir);
    }
}
