//! The Pomodoro timer. Pure state and transitions; lib.rs drives it from a ticker thread
//! and tells the windows about it. Times are Unix milliseconds.

use serde::Serialize;

/// Focus sessions in a set; the break after the last one is a long break.
const SET_SIZE: u32 = 4;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    #[default]
    Idle,
    Focus,
    ShortBreak,
    LongBreak,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Lengths {
    pub focus: i64,
    pub short_break: i64,
    pub long_break: i64,
}

impl Lengths {
    pub fn from_minutes(focus: i64, short_break: i64, long_break: i64) -> Self {
        Lengths { focus: focus * 60_000, short_break: short_break * 60_000, long_break: long_break * 60_000 }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Timer {
    pub phase: Phase,
    pub running: bool,
    /// When the running phase ends.
    pub ends_at: Option<i64>,
    /// Time left in the phase while it is paused.
    pub remaining: i64,
    /// The phase's full length, for drawing progress.
    pub total: i64,
    /// The reminder the focus session is for, if any.
    pub task_id: Option<String>,
    /// Focus sessions finished in the current set of four.
    pub in_set: u32,
    /// Focus sessions finished today, and which day that is (`yyyy-mm-dd`, local time).
    pub today: u32,
    pub day: String,
}

/// What just ended, for notifications and counting.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finished {
    pub phase: Phase,
    pub next: Phase,
    pub task_id: Option<String>,
    /// A focus session that ran its full length; skipped ones don't count.
    pub counted: bool,
}

impl Timer {
    /// Starts a focus session now, replacing whatever was running.
    pub fn start_focus(&mut self, task_id: Option<String>, lengths: Lengths, now: i64) {
        self.begin(Phase::Focus, lengths.focus, now);
        self.task_id = task_id;
    }

    /// Start, pause or resume: what the shortcut and the floating list's pill do.
    pub fn toggle(&mut self, lengths: Lengths, now: i64) {
        if self.phase == Phase::Idle {
            self.start_focus(self.task_id.clone(), lengths, now);
        } else if self.running {
            self.pause(now);
        } else {
            self.resume(now);
        }
    }

    pub fn pause(&mut self, now: i64) {
        if let (true, Some(ends_at)) = (self.running, self.ends_at) {
            self.remaining = (ends_at - now).max(0);
            self.running = false;
            self.ends_at = None;
        }
    }

    pub fn resume(&mut self, now: i64) {
        if !self.running && self.phase != Phase::Idle {
            self.ends_at = Some(now + self.remaining);
            self.running = true;
        }
    }

    /// Stops the current session without counting it. The set and today's total stay.
    pub fn reset(&mut self) {
        self.phase = Phase::Idle;
        self.running = false;
        self.ends_at = None;
        self.remaining = 0;
        self.total = 0;
    }

    /// Ends the current phase early. A skipped focus session goes to its break but isn't counted.
    pub fn skip(&mut self, lengths: Lengths, now: i64) -> Option<Finished> {
        self.finish(false, lengths, now)
    }

    /// Moves time forward: starts a new day's count, and ends a phase whose time is up.
    pub fn tick(&mut self, lengths: Lengths, now: i64, day: &str) -> Option<Finished> {
        if self.day != day {
            self.day = day.to_string();
            self.today = 0;
        }
        match self.ends_at {
            Some(ends_at) if self.running && now >= ends_at => self.finish(true, lengths, now),
            _ => None,
        }
    }

    fn begin(&mut self, phase: Phase, length: i64, now: i64) {
        self.phase = phase;
        self.running = true;
        self.total = length;
        self.remaining = length;
        self.ends_at = Some(now + length);
    }

    fn finish(&mut self, counted: bool, lengths: Lengths, now: i64) -> Option<Finished> {
        let task_id = self.task_id.clone();
        match self.phase {
            Phase::Idle => None,
            Phase::Focus => {
                if counted {
                    self.in_set += 1;
                    self.today += 1;
                }
                // Breaks start by themselves.
                let (next, length) = if counted && self.in_set >= SET_SIZE {
                    (Phase::LongBreak, lengths.long_break)
                } else {
                    (Phase::ShortBreak, lengths.short_break)
                };
                self.begin(next, length, now);
                Some(Finished { phase: Phase::Focus, next, task_id, counted })
            }
            phase @ (Phase::ShortBreak | Phase::LongBreak) => {
                if phase == Phase::LongBreak {
                    self.in_set = 0;
                }
                // The next focus session waits to be started.
                self.reset();
                Some(Finished { phase, next: Phase::Idle, task_id, counted: false })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;

    fn lengths() -> Lengths {
        Lengths::from_minutes(25, 5, 15)
    }

    #[test]
    fn a_focus_session_runs_then_its_break_starts_by_itself() {
        let mut timer = Timer::default();
        timer.start_focus(Some("task".into()), lengths(), 0);
        assert_eq!(timer.tick(lengths(), 24 * MIN, "d"), None);

        let done = timer.tick(lengths(), 25 * MIN, "d").unwrap();
        assert_eq!(done, Finished { phase: Phase::Focus, next: Phase::ShortBreak, task_id: Some("task".into()), counted: true });
        assert_eq!((timer.phase, timer.running, timer.ends_at), (Phase::ShortBreak, true, Some(30 * MIN)));
        assert_eq!((timer.in_set, timer.today), (1, 1));

        let done = timer.tick(lengths(), 30 * MIN, "d").unwrap();
        assert_eq!(done.next, Phase::Idle);
        assert_eq!((timer.phase, timer.running), (Phase::Idle, false));
    }

    #[test]
    fn every_fourth_focus_session_earns_a_long_break() {
        let mut timer = Timer::default();
        let mut now = 0;
        for round in 1..=4 {
            timer.start_focus(None, lengths(), now);
            now += 25 * MIN;
            let done = timer.tick(lengths(), now, "d").unwrap();
            assert_eq!(done.next, if round == 4 { Phase::LongBreak } else { Phase::ShortBreak });
            now += if round == 4 { 15 * MIN } else { 5 * MIN };
            timer.tick(lengths(), now, "d");
        }
        assert_eq!((timer.in_set, timer.today), (0, 4));
    }

    #[test]
    fn pausing_keeps_the_time_left() {
        let mut timer = Timer::default();
        timer.start_focus(None, lengths(), 0);
        timer.pause(10 * MIN);
        assert_eq!((timer.running, timer.remaining), (false, 15 * MIN));
        assert_eq!(timer.tick(lengths(), 60 * MIN, "d"), None);
        timer.resume(60 * MIN);
        assert_eq!(timer.ends_at, Some(75 * MIN));
    }

    #[test]
    fn toggle_starts_pauses_and_resumes_keeping_the_last_reminder() {
        let mut timer = Timer::default();
        timer.start_focus(Some("task".into()), lengths(), 0);
        timer.reset();
        timer.toggle(lengths(), 0);
        assert_eq!((timer.phase, timer.running, timer.task_id.as_deref()), (Phase::Focus, true, Some("task")));
        timer.toggle(lengths(), MIN);
        assert!(!timer.running);
        timer.toggle(lengths(), 2 * MIN);
        assert_eq!(timer.ends_at, Some(26 * MIN));
    }

    #[test]
    fn a_skipped_focus_session_is_not_counted() {
        let mut timer = Timer::default();
        timer.start_focus(None, lengths(), 0);
        let done = timer.skip(lengths(), MIN).unwrap();
        assert!(!done.counted);
        assert_eq!((timer.phase, timer.in_set, timer.today), (Phase::ShortBreak, 0, 0));
        assert_eq!(timer.skip(lengths(), MIN).unwrap().next, Phase::Idle);
        assert_eq!(timer.skip(lengths(), MIN), None);
    }

    #[test]
    fn todays_count_starts_over_on_a_new_day() {
        let mut timer = Timer { today: 7, day: "2026-11-03".into(), ..Timer::default() };
        timer.tick(lengths(), 0, "2026-11-04");
        assert_eq!((timer.today, timer.day.as_str()), (0, "2026-11-04"));
    }
}
