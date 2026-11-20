//! Coach: notices when you're off track during focus time and climbs a ladder of nudges.
//! Pure logic only; lib.rs reads the front window and idle time and drives it every few seconds.
//! Window titles go into `classify` and nowhere else: they are never stored (docs/adr/0001).

use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime, NaiveTime, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub enabled: bool,
    /// Seven days, Sunday first, each a list of `{start, end}` "HH:mm" ranges.
    pub focus_hours: Vec<Vec<Range>>,
    pub also_when_overdue: bool,
    pub distractions: Vec<Distraction>,
    pub idle_minutes: i64,
    pub nudge_after: i64,
    pub push_after: i64,
    pub reset_after: i64,
    pub real_talk: bool,
    pub real_talk_after: i64,
    pub takeover: bool,
    pub takeover_after: i64,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            enabled: false,
            focus_hours: vec![Vec::new(); 7],
            also_when_overdue: false,
            distractions: Vec::new(),
            idle_minutes: 10,
            nudge_after: 1,
            push_after: 5,
            reset_after: 2,
            real_talk: true,
            real_talk_after: 20,
            takeover: true,
            takeover_after: 10,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Range {
    pub start: String,
    pub end: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Distraction {
    pub kind: String,
    #[serde(rename = "match")]
    pub matches: String,
}

/// Coach's settings from the saved data. The front end has already checked them.
pub fn settings(data: &Value) -> Settings {
    serde_json::from_value(data["settings"]["coach"].clone()).unwrap_or_default()
}

/// What you are doing right now, as far as Coach is concerned.
#[derive(Clone, Debug, PartialEq)]
pub enum Reading {
    OnTrack,
    /// On a distraction: its name as listed (such as "YouTube"), and its list entry's key.
    Distraction { name: String, entry: String },
    Idle,
}

/// A list entry's key, such as "site:youtube" or "app:steam", for work exceptions.
pub fn entry_key(d: &Distraction) -> String {
    let m = if d.kind == "app" { app_key(&d.matches) } else { d.matches.trim().to_lowercase() };
    format!("{}:{m}", d.kind)
}

const BROWSERS: [&str; 6] = ["chrome", "msedge", "firefox", "brave", "opera", "vivaldi"];

fn app_key(name: &str) -> String {
    let name = name.trim().to_lowercase();
    name.strip_suffix(".exe").unwrap_or(&name).to_string()
}

/// Whether `word` appears in `text` on its own: not as part of a longer word. Ignores case.
fn has_word(text: &str, word: &str) -> bool {
    let (text, word) = (text.to_lowercase(), word.to_lowercase());
    if word.is_empty() {
        return false;
    }
    let edge = |c: Option<char>| c.is_none_or(|c| !c.is_alphanumeric());
    text.match_indices(&word).any(|(i, _)| edge(text[..i].chars().next_back()) && edge(text[i + word.len()..].chars().next()))
}

/// Classifies the front window. Sites only count in a browser; RemMe itself is always on track.
/// A distraction in front wins over idle, so a video playing doesn't count as idle. An entry in
/// `for_work` (keys from `entry_key`) is ignored, and reads as on track even while idle.
pub fn classify(app: &str, title: &str, idle_secs: u64, s: &Settings, for_work: &[String]) -> Reading {
    let app = app_key(app);
    if app != "remme" {
        let browser = BROWSERS.contains(&app.as_str());
        for d in &s.distractions {
            let hit = match d.kind.as_str() {
                "app" => app_key(&d.matches) == app,
                "site" => browser && has_word(title, &d.matches),
                _ => false,
            };
            if hit {
                let entry = entry_key(d);
                if for_work.contains(&entry) {
                    return Reading::OnTrack;
                }
                // An app reads better without ".exe": "Close steam", not "Close steam.exe".
                let name = d.matches.trim();
                let name = if d.kind == "app" { name.strip_suffix(".exe").or_else(|| name.strip_suffix(".EXE")).unwrap_or(name) } else { name };
                return Reading::Distraction { name: name.to_string(), entry };
            }
        }
    }
    if idle_secs >= (s.idle_minutes.max(1) as u64) * 60 {
        return Reading::Idle;
    }
    Reading::OnTrack
}

/// A stretch of focus time. Off-track totals (for real talk) count per block.
#[derive(Clone, Debug, PartialEq)]
pub struct Block {
    /// Changes when a new block starts.
    pub key: String,
    /// When it ends, if known (focus hours and focus sessions have an end; "overdue" doesn't).
    pub ends: Option<NaiveDateTime>,
}

fn time(s: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(s, "%H:%M").ok()
}

/// The focus block `now` is in: focus hours first, then a running focus session, then (if
/// switched on) any time a reminder is overdue. None outside focus time.
pub fn focus_block(s: &Settings, now: NaiveDateTime, session_ends: Option<NaiveDateTime>, any_overdue: bool) -> Option<Block> {
    let day = now.weekday().num_days_from_sunday() as usize;
    for r in s.focus_hours.get(day).into_iter().flatten() {
        let (Some(start), Some(end)) = (time(&r.start), time(&r.end)) else { continue };
        if now.time() >= start && now.time() < end {
            return Some(Block { key: format!("hours:{}:{}", now.date(), r.start), ends: Some(now.date().and_time(end)) });
        }
    }
    if let Some(ends) = session_ends {
        return Some(Block { key: format!("session:{}", ends.and_utc().timestamp()), ends: Some(ends) });
    }
    if s.also_when_overdue && any_overdue {
        return Some(Block { key: format!("overdue:{}", now.date()), ends: None });
    }
    None
}

/// The reminder Coach points you to.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Named {
    pub id: String,
    pub title: String,
}

fn local_due(task: &Value) -> Option<NaiveDateTime> {
    let due = task["dueAt"].as_str()?;
    Some(DateTime::parse_from_rfc3339(due).ok()?.with_timezone(&Local).naive_local())
}

fn is_overdue(task: &Value, now: NaiveDateTime) -> bool {
    let Some(due) = local_due(task) else { return false };
    if task["dueHasTime"].as_bool().unwrap_or(false) { due < now } else { due.date() < now.date() }
}

fn open_tasks(data: &Value) -> impl Iterator<Item = &Value> {
    data["tasks"].as_array().into_iter().flatten().filter(|t| !t["completed"].as_bool().unwrap_or(false))
}

pub fn any_overdue(data: &Value, now: NaiveDateTime) -> bool {
    open_tasks(data).any(|t| is_overdue(t, now))
}

/// What to name, in order: the focus session's reminder, the most overdue one, the next due
/// today, a flagged one. None means Coach says something general.
pub fn pick_reminder(data: &Value, session_task: Option<&str>, now: NaiveDateTime) -> Option<Named> {
    let named = |t: &Value| {
        let title = t["title"].as_str().unwrap_or("").trim();
        Named { id: t["id"].as_str().unwrap_or("").to_string(), title: if title.is_empty() { "New Reminder".into() } else { title.into() } }
    };
    if let Some(id) = session_task {
        if let Some(t) = open_tasks(data).find(|t| t["id"].as_str() == Some(id)) {
            return Some(named(t));
        }
    }
    let today = |t: &&Value| local_due(t).is_some_and(|d| d.date() == now.date());
    open_tasks(data)
        .filter(|t| is_overdue(t, now))
        .min_by_key(|t| local_due(t))
        .or_else(|| open_tasks(data).filter(today).min_by_key(|t| local_due(t)))
        .or_else(|| open_tasks(data).find(|t| t["flagged"].as_bool().unwrap_or(false)))
        .map(named)
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Step {
    Nudge,
    Push,
    Takeover,
}

/// The longest gap between two checks that still counts; a longer one (the PC slept) counts as this.
const MAX_TICK_SECS: i64 = 15;
/// Being back on track this long in a row ends real talk.
const REAL_TALK_ENDS_SECS: i64 = 15 * 60;

/// Off-track timing for the ladder and real talk.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Ladder {
    block: Option<String>,
    last: Option<i64>,
    /// Off track without a stop (short flicks back to work don't stop it), and back on track in a row.
    off_run: i64,
    on_run: i64,
    nudged: bool,
    /// When the last Push fired, on the `off_run` clock. With the Takeover off, the Push repeats.
    pushed_at: Option<i64>,
    taken_over: bool,
    /// Off track in total in this block, for real talk.
    block_total: i64,
    pub real_talk: bool,
    /// A snooze: until then time still counts toward real talk, but no step shows.
    hold_until: Option<i64>,
    /// After a snooze or break (or a restart with a Takeover up): if the next check finds you
    /// off track, the Push shows at once and the Takeover follows (Takeover - Push) later.
    resume_pending: bool,
}

impl Ladder {
    /// Starts the climb over (after Start focus, or a Pause), keeping the block's real-talk total.
    pub fn restart(&mut self) {
        self.off_run = 0;
        self.on_run = 0;
        self.nudged = false;
        self.pushed_at = None;
        self.taken_over = false;
        self.hold_until = None;
        self.resume_pending = false;
        self.last = None;
    }

    /// Outside focus time: forget the block.
    pub fn leave(&mut self) {
        *self = Ladder::default();
    }

    /// The focus block the ladder is in, for counting breaks.
    pub fn block(&self) -> Option<&str> {
        self.block.as_deref()
    }

    /// A snooze until `until`: no steps until then, and then on to the Push if still off track.
    pub fn hold(&mut self, until: i64) {
        if self.hold_until != Some(until) {
            // Keep the clock going: snooze time counts toward real talk.
            let last = self.last;
            self.restart();
            self.last = last;
            self.hold_until = Some(until);
        }
    }

    /// After a break, or a restart with a Takeover up: the next off-track check goes straight to the Push.
    pub fn resume_at_push(&mut self) {
        self.restart();
        self.resume_pending = true;
    }

    /// One check at `now` (Unix seconds) in `block`. Returns the step to show, if one is due.
    pub fn tick(&mut self, now: i64, block: &str, reading: &Reading, s: &Settings) -> Option<Step> {
        if self.block.as_deref() != Some(block) {
            // A fresh ladder for a new block; one that just started (after a restart) keeps what's pending.
            let keep = if self.block.is_none() { (self.hold_until, self.resume_pending) } else { (None, false) };
            *self = Ladder { block: Some(block.to_string()), hold_until: keep.0, resume_pending: keep.1, ..Ladder::default() };
        }
        let dt = self.last.map_or(0, |last| (now - last).clamp(0, MAX_TICK_SECS));
        self.last = Some(now);
        let push_mins = s.push_after.max(s.nudge_after + 1);
        let push_after = push_mins * 60;
        let takeover_after = s.takeover_after.max(push_mins + 1) * 60;
        let off = *reading != Reading::OnTrack;

        if let Some(until) = self.hold_until {
            if now < until {
                if off {
                    self.add_to_total(dt, s);
                }
                return None;
            }
            self.hold_until = None;
            self.resume_pending = true;
        }
        if self.resume_pending {
            self.resume_pending = false;
            if off {
                self.off_run = push_after;
                self.on_run = 0;
                self.nudged = true;
                self.pushed_at = Some(push_after);
                self.add_to_total(dt, s);
                return Some(Step::Push);
            }
        }

        if !off {
            self.on_run += dt;
            if self.on_run >= s.reset_after.max(1) * 60 {
                self.off_run = 0;
                self.nudged = false;
                self.pushed_at = None;
                self.taken_over = false;
            }
            if self.real_talk && self.on_run >= REAL_TALK_ENDS_SECS {
                self.real_talk = false;
                self.block_total = 0;
            }
            return None;
        }

        self.on_run = 0;
        self.off_run += dt;
        self.add_to_total(dt, s);
        if self.off_run >= push_after {
            if s.takeover {
                if !self.taken_over && self.off_run >= takeover_after {
                    self.taken_over = true;
                    self.nudged = true;
                    self.pushed_at.get_or_insert(self.off_run);
                    return Some(Step::Takeover);
                }
                if self.pushed_at.is_none() {
                    self.pushed_at = Some(self.off_run);
                    self.nudged = true;
                    return Some(Step::Push);
                }
                return None;
            }
            // With no Takeover, the Push comes back every `push_after` while you stay off track.
            let due = self.pushed_at.is_none_or(|at| self.off_run - at >= push_after);
            if due {
                self.pushed_at = Some(self.off_run);
                self.nudged = true;
                return Some(Step::Push);
            }
            return None;
        }
        if !self.nudged && self.off_run >= s.nudge_after.max(1) * 60 {
            self.nudged = true;
            return Some(Step::Nudge);
        }
        None
    }

    fn add_to_total(&mut self, dt: i64, s: &Settings) {
        self.block_total += dt;
        if s.real_talk && self.block_total >= s.real_talk_after.max(1) * 60 {
            self.real_talk = true;
        }
    }
}

pub const SNOOZE_SECS: i64 = 5 * 60;
pub const SNOOZES_PER_HOUR: usize = 2;
pub const BREAK_SECS: i64 = 15 * 60;
pub const BREAKS_PER_BLOCK: u32 = 3;

/// The Takeover's escape hatches and their limits, saved so restarting RemMe doesn't reset them.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Limits {
    /// When each snooze of the last hour started (Unix seconds).
    pub snoozes: Vec<i64>,
    pub snooze_until: Option<i64>,
    /// The focus block the break count belongs to.
    pub break_block: String,
    pub breaks: u32,
    pub break_until: Option<i64>,
}

impl Limits {
    fn recent(&self, now: i64) -> impl Iterator<Item = &i64> {
        self.snoozes.iter().filter(move |&&t| now - t < 3600)
    }

    pub fn snoozes_left(&self, now: i64) -> usize {
        SNOOZES_PER_HOUR.saturating_sub(self.recent(now).count())
    }

    /// With none left, when the next snooze frees up.
    pub fn next_snooze(&self, now: i64) -> Option<i64> {
        if self.snoozes_left(now) > 0 {
            return None;
        }
        self.recent(now).min().map(|t| t + 3600)
    }

    pub fn breaks_left(&self, block: &str) -> u32 {
        if self.break_block == block { BREAKS_PER_BLOCK.saturating_sub(self.breaks) } else { BREAKS_PER_BLOCK }
    }

    /// Starts a snooze if one is left. Returns when it ends.
    pub fn snooze(&mut self, now: i64) -> Option<i64> {
        if self.snoozes_left(now) == 0 {
            return None;
        }
        self.snoozes.retain(|&t| now - t < 3600);
        self.snoozes.push(now);
        self.snooze_until = Some(now + SNOOZE_SECS);
        self.snooze_until
    }

    /// Starts a break in `block` if one is left. Returns when it ends.
    pub fn take_break(&mut self, now: i64, block: &str) -> Option<i64> {
        if self.breaks_left(block) == 0 {
            return None;
        }
        if self.break_block != block {
            self.break_block = block.to_string();
            self.breaks = 0;
        }
        self.breaks += 1;
        self.snooze_until = None;
        self.break_until = Some(now + BREAK_SECS);
        self.break_until
    }
}

/// A distraction-list entry ignored for an hour after "This is for work". Only the entry's key
/// and name are kept, never a window title.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkException {
    pub entry: String,
    pub name: String,
    pub until: i64,
}

pub const WORK_SECS: i64 = 60 * 60;

/// Adds (or renews) an hour's exception for `entry`, dropping expired ones.
pub fn allow_for_work(list: &mut Vec<WorkException>, entry: &str, name: &str, now: i64) {
    list.retain(|w| w.until > now && w.entry != entry);
    list.push(WorkException { entry: entry.to_string(), name: name.to_string(), until: now + WORK_SECS });
}

/// The keys of the exceptions still running.
pub fn active_work(list: &[WorkException], now: i64) -> Vec<String> {
    list.iter().filter(|w| w.until > now).map(|w| w.entry.clone()).collect()
}

/// "5:00 pm"-style local time for the tray and sidebar.
pub fn clock(t: NaiveDateTime) -> String {
    let (pm, h) = t.hour12();
    format!("{h}:{:02} {}", t.minute(), if pm { "pm" } else { "am" })
}

/// Today at midnight's end, for "Pause for the rest of the day".
pub fn end_of_day(now: NaiveDateTime) -> NaiveDateTime {
    let next: NaiveDate = now.date().succ_opt().unwrap_or(now.date());
    next.and_hms_opt(0, 0, 0).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn s() -> Settings {
        serde_json::from_value(json!({
            "enabled": true,
            "focusHours": [[], [{"start": "09:00", "end": "12:00"}], [], [], [], [], []],
            "distractions": [{"kind": "site", "match": "YouTube"}, {"kind": "app", "match": "steam.exe"}, {"kind": "site", "match": "X"}],
            "idleMinutes": 10, "nudgeAfter": 1, "pushAfter": 5, "resetAfter": 2, "realTalk": true, "realTalkAfter": 20
        }))
        .unwrap()
    }

    fn yt() -> Reading {
        Reading::Distraction { name: "YouTube".into(), entry: "site:youtube".into() }
    }

    fn at(y: i32, m: u32, d: u32, h: u32, min: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d).unwrap().and_hms_opt(h, min, 0).unwrap()
    }

    #[test]
    fn sites_count_only_in_a_browser_and_as_whole_words() {
        let s = s();
        assert_eq!(classify("chrome.exe", "Funny cats - YouTube - Google Chrome", 0, &s, &[]), yt());
        assert_eq!(classify("WINWORD.EXE", "YouTube marketing plan.docx", 0, &s, &[]), Reading::OnTrack);
        // "X" must not match the x in "Excel" or "Box".
        assert_eq!(classify("msedge.exe", "Box - Excel online - Microsoft Edge", 0, &s, &[]), Reading::OnTrack);
        assert_eq!(classify("msedge.exe", "Home / X - Microsoft Edge", 0, &s, &[]), Reading::Distraction { name: "X".into(), entry: "site:x".into() });
        assert_eq!(classify("Steam.exe", "Steam", 0, &s, &[]), Reading::Distraction { name: "steam".into(), entry: "app:steam".into() });
    }

    #[test]
    fn idle_counts_unless_a_distraction_is_in_front_and_remme_is_never_off_track() {
        let s = s();
        assert_eq!(classify("code.exe", "main.rs", 11 * 60, &s, &[]), Reading::Idle);
        assert_eq!(classify("code.exe", "main.rs", 9 * 60, &s, &[]), Reading::OnTrack);
        assert_eq!(classify("chrome.exe", "Lecture - YouTube", 30 * 60, &s, &[]), yt());
        assert_eq!(classify("remme.exe", "YouTube", 0, &s, &[]), Reading::OnTrack);
    }

    #[test]
    fn focus_time_is_focus_hours_or_a_focus_session_or_overdue_when_switched_on() {
        let mut s = s();
        // Monday 16 Nov 2026.
        let block = focus_block(&s, at(2026, 11, 16, 10, 0), None, false).unwrap();
        assert_eq!(block.ends, Some(at(2026, 11, 16, 12, 0)));
        assert!(focus_block(&s, at(2026, 11, 16, 12, 0), None, false).is_none());
        assert!(focus_block(&s, at(2026, 11, 17, 10, 0), None, true).is_none());
        // A focus session turns Coach on outside focus hours.
        let ends = at(2026, 11, 17, 10, 25);
        assert_eq!(focus_block(&s, at(2026, 11, 17, 10, 0), Some(ends), false).unwrap().ends, Some(ends));
        s.also_when_overdue = true;
        assert_eq!(focus_block(&s, at(2026, 11, 17, 10, 0), None, true).unwrap().ends, None);
    }

    #[test]
    fn names_the_session_reminder_then_overdue_then_today_then_flagged() {
        let now = at(2026, 11, 16, 12, 0);
        let iso = |t: NaiveDateTime| t.and_local_timezone(Local).unwrap().to_rfc3339();
        let data = json!({"tasks": [
            {"id": "flag", "title": "Flagged one", "flagged": true},
            {"id": "today", "title": "Later today", "dueAt": iso(at(2026, 11, 16, 15, 0)), "dueHasTime": true},
            {"id": "late2", "title": "Late", "dueAt": iso(at(2026, 11, 15, 9, 0)), "dueHasTime": false},
            {"id": "late1", "title": "Very late", "dueAt": iso(at(2026, 11, 10, 9, 0)), "dueHasTime": false},
            {"id": "done", "title": "Done", "dueAt": iso(at(2026, 11, 1, 9, 0)), "completed": true}
        ]});
        assert_eq!(pick_reminder(&data, Some("today"), now).unwrap().id, "today");
        assert_eq!(pick_reminder(&data, None, now).unwrap().id, "late1");
        let no_late = json!({"tasks": [data["tasks"][0], data["tasks"][1]]});
        assert_eq!(pick_reminder(&no_late, None, now).unwrap().id, "today");
        let only_flag = json!({"tasks": [data["tasks"][0]]});
        assert_eq!(pick_reminder(&only_flag, None, now).unwrap().id, "flag");
        assert!(pick_reminder(&json!({"tasks": []}), None, now).is_none());
        assert!(any_overdue(&data, now));
    }

    /// Runs the ladder for `secs` seconds of `reading`, a check every 5 seconds, collecting the steps.
    fn run(l: &mut Ladder, t: &mut i64, secs: i64, reading: &Reading, s: &Settings) -> Vec<Step> {
        let mut steps = Vec::new();
        for _ in 0..secs / 5 {
            *t += 5;
            steps.extend(l.tick(*t, "b", reading, s));
        }
        steps
    }

    #[test]
    fn nudges_after_a_minute_and_pushes_after_five() {
        let s = s();
        let (mut l, mut t) = (Ladder::default(), 0);
        let yt = yt();
        l.tick(t, "b", &yt, &s);
        assert_eq!(run(&mut l, &mut t, 55, &yt, &s), vec![]);
        assert_eq!(run(&mut l, &mut t, 5, &yt, &s), vec![Step::Nudge]);
        assert_eq!(run(&mut l, &mut t, 240, &yt, &s), vec![Step::Push]);
        // With the Takeover on, the Push doesn't repeat: the Takeover comes at 10 minutes, once.
        assert_eq!(run(&mut l, &mut t, 300, &yt, &s), vec![Step::Takeover]);
        assert_eq!(run(&mut l, &mut t, 1200, &yt, &s), vec![]);
    }

    #[test]
    fn without_the_takeover_the_push_repeats() {
        let mut s = s();
        s.takeover = false;
        let (mut l, mut t) = (Ladder::default(), 0);
        let yt = yt();
        l.tick(t, "b", &yt, &s);
        assert_eq!(run(&mut l, &mut t, 300, &yt, &s), vec![Step::Nudge, Step::Push]);
        assert_eq!(run(&mut l, &mut t, 300, &yt, &s), vec![Step::Push]);
    }

    #[test]
    fn after_a_snooze_off_track_goes_straight_to_the_push_then_the_takeover() {
        let s = s();
        let (mut l, mut t) = (Ladder::default(), 0);
        let yt = yt();
        l.tick(t, "b", &yt, &s);
        assert_eq!(run(&mut l, &mut t, 600, &yt, &s), vec![Step::Nudge, Step::Push, Step::Takeover]);
        l.hold(t + SNOOZE_SECS);
        // Nothing during the snooze, but the time counts toward real talk (10 + 5 minutes so far).
        assert_eq!(run(&mut l, &mut t, 295, &yt, &s), vec![]);
        assert_eq!(run(&mut l, &mut t, 5, &yt, &s), vec![Step::Push]);
        // The Takeover comes back Takeover - Push = 5 minutes later.
        assert_eq!(run(&mut l, &mut t, 295, &yt, &s), vec![]);
        assert_eq!(run(&mut l, &mut t, 5, &yt, &s), vec![Step::Takeover]);
        assert!(l.real_talk);
    }

    #[test]
    fn a_snooze_that_ends_on_track_starts_the_climb_over() {
        let s = s();
        let (mut l, mut t) = (Ladder::default(), 0);
        let yt = yt();
        l.tick(t, "b", &yt, &s);
        run(&mut l, &mut t, 600, &yt, &s);
        l.hold(t + SNOOZE_SECS);
        run(&mut l, &mut t, 300, &Reading::OnTrack, &s);
        assert_eq!(run(&mut l, &mut t, 60, &yt, &s), vec![Step::Nudge]);
    }

    #[test]
    fn resuming_after_a_break_or_restart_pushes_at_once_even_in_a_new_ladder() {
        let s = s();
        let yt = yt();
        // A restart with a Takeover up: a fresh ladder that hasn't seen a block yet.
        let mut l = Ladder::default();
        l.resume_at_push();
        assert_eq!(l.tick(0, "b", &yt, &s), Some(Step::Push));
        // After a break that ends on track, nothing shows.
        let mut l = Ladder::default();
        l.tick(0, "b", &yt, &s);
        l.resume_at_push();
        assert_eq!(l.tick(5, "b", &Reading::OnTrack, &s), None);
    }

    #[test]
    fn after_a_break_ends_off_track_the_push_shows_and_the_takeover_follows() {
        let s = s();
        let (mut l, mut t) = (Ladder::default(), 0);
        let yt = yt();
        l.tick(t, "b", &yt, &s);
        assert_eq!(run(&mut l, &mut t, 600, &yt, &s), vec![Step::Nudge, Step::Push, Step::Takeover]);
        // A break: the ladder restarts and isn't ticked until it ends.
        l.restart();
        t += 600;
        l.resume_at_push();
        assert_eq!(l.tick(t, "b", &yt, &s), Some(Step::Push));
        assert_eq!(run(&mut l, &mut t, 300, &yt, &s), vec![Step::Takeover]);
    }

    #[test]
    fn snoozes_are_two_an_hour_and_breaks_three_a_block() {
        let mut lim = Limits::default();
        assert_eq!(lim.snooze(0), Some(SNOOZE_SECS));
        assert_eq!(lim.snoozes_left(100), 1);
        assert!(lim.snooze(1000).is_some());
        assert_eq!(lim.snooze(2000), None);
        assert_eq!(lim.next_snooze(2000), Some(3600));
        assert_eq!(lim.snoozes_left(3600), 1);
        assert!(lim.snooze(3600).is_some());
        for _ in 0..3 {
            assert!(lim.take_break(0, "b").is_some());
        }
        assert_eq!(lim.breaks_left("b"), 0);
        assert_eq!(lim.take_break(0, "b"), None);
        assert_eq!(lim.breaks_left("next"), 3);
        assert_eq!(lim.take_break(10, "next"), Some(10 + BREAK_SECS));
    }

    #[test]
    fn this_is_for_work_ignores_only_that_entry_for_an_hour() {
        let s = s();
        let mut work = Vec::new();
        allow_for_work(&mut work, "site:youtube", "YouTube", 0);
        let keys = active_work(&work, 100);
        assert_eq!(classify("chrome.exe", "Tutorial - YouTube", 0, &s, &keys), Reading::OnTrack);
        // Even idle on it: a work video playing isn't idle.
        assert_eq!(classify("chrome.exe", "Tutorial - YouTube", 3600, &s, &keys), Reading::OnTrack);
        assert_eq!(classify("steam.exe", "Steam", 0, &s, &keys), Reading::Distraction { name: "steam".into(), entry: "app:steam".into() });
        assert!(active_work(&work, WORK_SECS).is_empty());
        assert_eq!(entry_key(&Distraction { kind: "app".into(), matches: "Steam.EXE".into() }), "app:steam");
    }

    #[test]
    fn two_minutes_on_track_resets_but_a_short_flick_does_not() {
        let s = s();
        let (mut l, mut t) = (Ladder::default(), 0);
        let yt = yt();
        l.tick(t, "b", &yt, &s);
        assert_eq!(run(&mut l, &mut t, 60, &yt, &s), vec![Step::Nudge]);
        // A 30-second flick back to work doesn't restart the climb: the Push still comes at 5 minutes off.
        run(&mut l, &mut t, 30, &Reading::OnTrack, &s);
        assert_eq!(run(&mut l, &mut t, 240, &yt, &s), vec![Step::Push]);
        // Two minutes on track does restart it: the next step is a Nudge again.
        run(&mut l, &mut t, 120, &Reading::OnTrack, &s);
        assert_eq!(run(&mut l, &mut t, 60, &yt, &s), vec![Step::Nudge]);
    }

    #[test]
    fn real_talk_starts_after_twenty_minutes_in_total_and_ends_after_fifteen_on_track() {
        let s = s();
        let (mut l, mut t) = (Ladder::default(), 0);
        let idle = Reading::Idle;
        l.tick(t, "b", &idle, &s);
        // Off in bursts with resets between: 4 x 5 minutes.
        for _ in 0..3 {
            run(&mut l, &mut t, 300, &idle, &s);
            run(&mut l, &mut t, 180, &Reading::OnTrack, &s);
            assert!(!l.real_talk);
        }
        run(&mut l, &mut t, 300, &idle, &s);
        assert!(l.real_talk);
        run(&mut l, &mut t, 14 * 60, &Reading::OnTrack, &s);
        assert!(l.real_talk);
        run(&mut l, &mut t, 60, &Reading::OnTrack, &s);
        assert!(!l.real_talk);
    }

    #[test]
    fn a_new_block_starts_fresh_and_a_long_gap_counts_as_one_check() {
        let s = s();
        let (mut l, mut t) = (Ladder::default(), 0);
        let yt = yt();
        l.tick(t, "b", &yt, &s);
        run(&mut l, &mut t, 60, &yt, &s);
        // The PC slept for an hour: that gap counts as 15 seconds, not an hour.
        assert_eq!(l.tick(t + 3600, "b", &yt, &s), None);
        assert_eq!(l.tick(t + 3605, "other", &yt, &s), None);
        assert!(!l.real_talk);
    }

    #[test]
    fn clock_reads_like_the_app() {
        assert_eq!(clock(at(2026, 11, 16, 17, 0)), "5:00 pm");
        assert_eq!(clock(at(2026, 11, 16, 9, 5)), "9:05 am");
        assert_eq!(end_of_day(at(2026, 11, 16, 9, 5)), at(2026, 11, 17, 0, 0));
    }
}
