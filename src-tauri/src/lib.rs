use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::Duration,
};

mod backup;
mod coach;
mod kokoro_vocab;
mod pomodoro;
mod voice;

use backup::Kind;
use chrono::{DateTime, Local, NaiveDateTime, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    menu::Submenu,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

use pomodoro::{Lengths, Phase, Timer};

const DATA_FILE: &str = "reminders.json";
const UI_FILE: &str = "ui-state.json";
/// The data folder name before the app was renamed to RemMe.
const OLD_DATA_DIR: &str = "com.reminders.app";
const DEFAULT_TOGGLE: &str = "Ctrl+Shift+O";
const DEFAULT_LOCK: &str = "Ctrl+Shift+L";
const DEFAULT_POMODORO: &str = "Ctrl+Shift+P";
const MAIN: &str = "main";
const FLOAT: &str = "float";
const COACH: &str = "coach";
/// Coach's voice files, inside the data folder.
const VOICE_DIR: &str = "voice";

/// Window state the backend owns, kept apart from the task data the UI saves.
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct UiState {
    float_visible: bool,
    float_locked: bool,
    /// `taskId|dueAt` keys that already raised a notification.
    notified: Vec<String>,
    /// When each nagging reminder last notified, in Unix seconds, by the same keys.
    last_nag: HashMap<String, i64>,
    /// Focus sessions finished on `pomodoro_day` (local `yyyy-mm-dd`), kept across restarts.
    pomodoro_day: String,
    pomodoro_today: u32,
    /// A second folder that also gets every backup, such as a OneDrive folder. Kept per PC,
    /// so restoring or importing data never changes it.
    backup_folder: Option<String>,
    /// Why the last copy to `backup_folder` failed, if it did.
    backup_folder_error: Option<String>,
    /// Set when a damaged data file was replaced at startup, until the banner is dismissed.
    recovery: Option<Recovery>,
    /// Coach is paused until this Unix time (seconds).
    coach_paused_until: Option<i64>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Recovery {
    /// Local time of the backup that was loaded, or `None` if there was none to load.
    restored_from: Option<String>,
    /// Where the damaged file was kept.
    corrupt_file: String,
}

#[derive(Default)]
struct Shortcuts {
    toggle: Option<(String, Shortcut)>,
    lock: Option<(String, Shortcut)>,
    pomodoro: Option<(String, Shortcut)>,
}

impl Shortcuts {
    fn all(&self) -> impl Iterator<Item = &(String, Shortcut)> {
        self.toggle.iter().chain(self.lock.iter()).chain(self.pomodoro.iter())
    }
}

struct AppState {
    dir: PathBuf,
    data: Mutex<Value>,
    ui: Mutex<UiState>,
    shortcuts: Mutex<Shortcuts>,
    timer: Mutex<Timer>,
    coach: Mutex<CoachRun>,
    voice: Mutex<VoiceRun>,
}

/// Coach's voice while RemMe runs: the loaded engine, and what Settings was last told.
struct VoiceRun {
    engine: Option<voice::Engine>,
    status: voice::Status,
    /// Every file has passed its fingerprint check this session.
    verified: bool,
}

/// Coach while RemMe runs: the ladder, what the windows were last told, and the tray's counts.
#[derive(Default)]
struct CoachRun {
    ladder: coach::Ladder,
    state: CoachState,
    /// Reminders due today and overdue, for the tray tooltip (sent by the main window).
    due_today: u32,
    overdue: u32,
    /// Whether the tray menu has its Coach items, and whether the icon has its marker.
    menu_on: Option<bool>,
    marked: Option<bool>,
}

/// What the windows show about Coach: the sidebar bar, the floating list, the tray.
#[derive(Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct CoachState {
    enabled: bool,
    watching: bool,
    /// "watching until 5:00 pm", "paused until 3:15 pm", or "on, waiting for focus time".
    label: String,
    paused: bool,
}

/// One step of the ladder, for the Coach popup.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CoachStep {
    step: coach::Step,
    named: Option<coach::Named>,
    /// The distraction's name, or None when you're idle.
    distraction: Option<String>,
    real_talk: bool,
}

#[derive(Clone, Serialize)]
struct DataChanged {
    source: String,
    data: Value,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FloatState {
    visible: bool,
    locked: bool,
}

fn default_data() -> Value {
    json!({
        "version": 1,
        "lists": [
            { "id": "reminders", "name": "Reminders", "color": "blue", "icon": "list", "sections": [] }
        ],
        "tasks": [],
        "settings": {
            "toggleShortcut": DEFAULT_TOGGLE,
            "lockShortcut": DEFAULT_LOCK,
            "pomodoroShortcut": DEFAULT_POMODORO,
            "floatView": "today"
        }
    })
}

/// A local day's 09:00 as an RFC 3339 UTC time, the way a date-only reminder is stored.
fn nine_am(day: chrono::NaiveDate) -> String {
    let local = day.and_hms_opt(9, 0, 0).and_then(|t| t.and_local_timezone(Local).earliest());
    local.map_or_else(|| Utc::now().to_rfc3339(), |t| t.with_timezone(&Utc).to_rfc3339())
}

/// The data for a brand-new install: the usual empty list plus a Getting started list of
/// example reminders that show the main features. Recovery from a damaged file never gets these.
fn first_run_data(now: DateTime<Local>) -> Value {
    let mut data = default_data();
    let today = now.date_naive();
    let created = now.with_timezone(&Utc).to_rfc3339();
    let examples = [
        (
            "Welcome to RemMe! Tick this off when you've read it",
            "Ticked-off reminders move to Done. For a few seconds, Undo can bring one back.",
            Some(today),
            false,
        ),
        (
            "Type a date into a title, like \"Call mom tomorrow 5pm\"",
            "RemMe reads days, times, repeats (\"every friday\") and priority (!, !! or !!!) from what you type.",
            Some(today),
            false,
        ),
        (
            "Right-click a reminder to change its date, priority or list",
            "You can also click its date or priority. Ctrl+click or Shift+click selects several at once.",
            None,
            true,
        ),
        (
            "Press Ctrl+Shift+O for the floating list",
            "It stays on top of your other windows. Ctrl+Shift+L locks it, so clicks go through to the window behind.",
            today.succ_opt(),
            false,
        ),
        (
            "Delete this list when you're done",
            "Use the ⋯ button beside Getting started in the sidebar. Recently deleted keeps it for 30 days.",
            None,
            false,
        ),
    ];
    let tasks: Vec<Value> = examples
        .iter()
        .enumerate()
        .map(|(i, (title, notes, due, flagged))| {
            json!({
                "id": format!("welcome-{}", i + 1),
                "listId": "getting-started",
                "title": title,
                "notes": notes,
                "dueAt": due.map(nine_am),
                "dueHasTime": false,
                "flagged": flagged,
                "createdAt": created,
            })
        })
        .collect();
    data["lists"].as_array_mut().unwrap().push(
        json!({ "id": "getting-started", "name": "Getting started", "color": "teal", "icon": "star", "sections": [] }),
    );
    data["tasks"] = Value::Array(tasks);
    data
}

/// Reads a JSON file. A corrupt file is kept as `<name>.corrupt` so nothing is silently lost.
fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let text = fs::read_to_string(path).ok()?;
    match serde_json::from_str(&text) {
        Ok(value) => Some(value),
        Err(_) => {
            let _ = fs::rename(path, path.with_extension("json.corrupt"));
            None
        }
    }
}

/// Writes through a temp file so a crash mid-write never leaves a half-written file.
fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, text).map_err(|e| format!("Could not save {}: {e}", path.display()))?;
    fs::rename(&temp, path).map_err(|e| format!("Could not save {}: {e}", path.display()))
}

/// Copies the data files from the folder used before the rename, the first time
/// RemMe starts. Existing RemMe data is never overwritten, and the old folder is left as it was.
fn copy_old_data(old_dir: &Path, dir: &Path) -> std::io::Result<bool> {
    if dir.join(DATA_FILE).exists() || !old_dir.join(DATA_FILE).exists() {
        return Ok(false);
    }
    fs::create_dir_all(dir)?;
    for file in [DATA_FILE, UI_FILE] {
        if old_dir.join(file).exists() {
            fs::copy(old_dir.join(file), dir.join(file))?;
        }
    }
    Ok(true)
}

fn save_ui(state: &AppState, ui: &UiState) {
    if let Err(error) = write_json(&state.dir.join(UI_FILE), ui) {
        eprintln!("{error}");
    }
}

fn local_now() -> NaiveDateTime {
    Local::now().naive_local()
}

fn backup_dir(state: &AppState) -> PathBuf {
    state.dir.join(backup::LOCAL_DIR)
}

/// The data file's text as it is on disk, or the data in memory if the file is missing.
fn current_data_text(state: &AppState) -> String {
    fs::read_to_string(state.dir.join(DATA_FILE)).unwrap_or_else(|_| {
        serde_json::to_string_pretty(&*state.data.lock().unwrap()).unwrap_or_default()
    })
}

/// Writes a backup to the local folder and, if one is set, the second folder.
/// A failed second copy is recorded for Settings to show; it never fails the backup.
fn make_backup(state: &AppState, text: &str, kind: Kind) -> Result<PathBuf, String> {
    let now = local_now();
    let local = backup_dir(state);
    let path = backup::write(&local, text, kind, now)?;
    backup::prune(&local, now.date());

    let folder = state.ui.lock().unwrap().backup_folder.clone();
    if let Some(folder) = folder {
        let result = if Path::new(&folder).is_dir() {
            let second = Path::new(&folder).join(backup::SECOND_DIR);
            backup::write(&second, text, kind, now).map(|_| backup::prune(&second, now.date()))
        } else {
            Err("folder not found".to_string())
        };
        let mut ui = state.ui.lock().unwrap();
        ui.backup_folder_error =
            result.err().map(|e| format!("Last copy to {folder} failed on {}: {e}", now.format("%-d %b")));
        save_ui(state, &ui);
    }
    Ok(path)
}

/// Before the first change of a new day, keeps the data file as it was at the end of the last day.
fn ensure_daily_backup(state: &AppState) {
    if !backup::needs_daily(&backup_dir(state), Local::now().date_naive()) {
        return;
    }
    let Ok(text) = fs::read_to_string(state.dir.join(DATA_FILE)) else { return };
    if let Err(error) = make_backup(state, &text, Kind::Daily) {
        eprintln!("{error}");
    }
}

/// Loads the data file. A damaged one is kept as `.corrupt` and replaced by the newest
/// backup that reads; `ui.recovery` then says what happened, for the banner.
fn load_or_recover(dir: &Path, ui: &mut UiState) -> Value {
    let path = dir.join(DATA_FILE);
    let existed = path.exists();
    if let Some(data) = read_json::<Value>(&path).filter(backup::is_data) {
        return data;
    }
    if !existed {
        return first_run_data(Local::now());
    }
    let corrupt = path.with_extension("json.corrupt");
    // Valid JSON of the wrong shape is still in place; read_json only moves files it can't parse.
    if path.exists() {
        let _ = fs::rename(&path, &corrupt);
    }
    let corrupt_file = corrupt.display().to_string();
    match backup::newest_readable(&dir.join(backup::LOCAL_DIR)) {
        Some((found, data)) => {
            if let Err(error) = write_json(&path, &data) {
                eprintln!("{error}");
            }
            let restored_from = Some(found.taken.format("%Y-%m-%dT%H:%M:%S").to_string());
            ui.recovery = Some(Recovery { restored_from, corrupt_file });
            data
        }
        None => {
            ui.recovery = Some(Recovery { restored_from: None, corrupt_file });
            default_data()
        }
    }
}

/// Replaces all data after keeping a safety backup, and tells both windows.
fn replace_data(app: &AppHandle, data: Value, kind: Kind) -> Result<(), String> {
    let state = app.state::<AppState>();
    make_backup(&state, &current_data_text(&state), kind)?;
    write_json(&state.dir.join(DATA_FILE), &data)?;
    *state.data.lock().unwrap() = data.clone();
    // The replaced settings may have other global shortcuts.
    let (toggle, lock, pomodoro) = (
        setting(&data, "toggleShortcut", DEFAULT_TOGGLE),
        setting(&data, "lockShortcut", DEFAULT_LOCK),
        setting(&data, "pomodoroShortcut", DEFAULT_POMODORO),
    );
    if let Err(error) = register_shortcuts(app, &toggle, &lock, &pomodoro) {
        eprintln!("{error}");
    }
    app.emit("data-changed", DataChanged { source: "backup".to_string(), data })
        .map_err(|e| e.to_string())
}

fn setting(data: &Value, key: &str, fallback: &str) -> String {
    data["settings"][key].as_str().unwrap_or(fallback).to_string()
}

#[derive(Debug, PartialEq)]
struct DueTask {
    id: String,
    /// `taskId|dueAt`, so moving the due time notifies again.
    key: String,
    title: String,
    /// Notify again this many minutes after the last one until the task is done.
    nag_minutes: Option<i64>,
    /// `taskId|snooze|snoozedUntil` for a snooze that has ended, so it notifies once more.
    snooze_key: Option<String>,
}

/// At most this many popups with buttons per check; the rest are summed up in one.
const MAX_POPUPS: usize = 3;

/// Returns every unfinished task whose due time has passed,
/// plus the set of keys for all tasks that have a due time.
fn due_tasks(data: &Value, now: DateTime<Utc>) -> (Vec<DueTask>, HashSet<String>) {
    let mut due = Vec::new();
    let mut all_keys = HashSet::new();
    for task in data["tasks"].as_array().into_iter().flatten() {
        let (Some(id), Some(due_at)) = (task["id"].as_str(), task["dueAt"].as_str()) else {
            continue;
        };
        let Ok(when) = DateTime::parse_from_rfc3339(due_at) else {
            continue;
        };
        let key = format!("{id}|{due_at}");
        all_keys.insert(key.clone());
        // A snoozed task stays quiet until its snooze ends, then notifies once more.
        let mut snooze_key = None;
        if let Some(until) = task["snoozedUntil"].as_str() {
            if let Ok(until_time) = DateTime::parse_from_rfc3339(until) {
                let skey = format!("{id}|snooze|{until}");
                all_keys.insert(skey.clone());
                if until_time > now {
                    continue;
                }
                snooze_key = Some(skey);
            }
        }
        if !task["completed"].as_bool().unwrap_or(false) && when <= now {
            let title = task["title"].as_str().unwrap_or("").trim();
            due.push(DueTask {
                id: id.to_string(),
                key,
                title: if title.is_empty() { "Reminder".into() } else { title.into() },
                nag_minutes: task["nagMinutes"].as_i64().filter(|m| *m > 0),
                snooze_key,
            });
        }
    }
    (due, all_keys)
}

/// Whether a due task should notify now: the first time it is due, then again
/// every `nag_minutes` for as long as it stays unfinished.
fn should_notify(task: &DueTask, ui: &UiState, now: i64) -> bool {
    if !ui.notified.contains(&task.key) {
        return true;
    }
    if task.snooze_key.as_ref().is_some_and(|key| !ui.notified.contains(key)) {
        return true;
    }
    let Some(minutes) = task.nag_minutes else { return false };
    ui.last_nag.get(&task.key).map_or(true, |last| now - last >= minutes * 60)
}

fn check_reminders(app: &AppHandle) {
    let state = app.state::<AppState>();
    let data = state.data.lock().unwrap().clone();
    let now = Utc::now();
    let (due, all_keys) = due_tasks(&data, now);

    let mut ui = state.ui.lock().unwrap();
    let before = (ui.notified.len(), ui.last_nag.len());
    ui.notified.retain(|key| all_keys.contains(key));
    ui.last_nag.retain(|key, _| all_keys.contains(key));
    let sticky = data["settings"]["stickyReminders"].as_bool() != Some(false);
    let mut popups = Vec::new();
    for task in due {
        if !should_notify(&task, &ui, now.timestamp()) {
            continue;
        }
        let snooze_ended = task.snooze_key.as_ref().is_some_and(|key| !ui.notified.contains(key));
        let again = ui.notified.contains(&task.key) && !snooze_ended;
        let heading = if again { "Still to do" } else { "Reminder" };
        popups.push((heading, task.id.clone(), task.title.clone()));
        if !ui.notified.contains(&task.key) {
            ui.notified.push(task.key.clone());
        }
        if let Some(key) = task.snooze_key.filter(|_| snooze_ended) {
            ui.notified.push(key);
        }
        if task.nag_minutes.is_some() {
            ui.last_nag.insert(task.key, now.timestamp());
        }
    }
    let fired = !popups.is_empty();
    if fired || (ui.notified.len(), ui.last_nag.len()) != before {
        save_ui(&state, &ui);
    }
    drop(ui);

    let more = popups.len().saturating_sub(MAX_POPUPS);
    for (heading, id, title) in popups.into_iter().take(MAX_POPUPS) {
        show_popup(app, Popup::Due { task_id: id, sticky }, heading, &title);
    }
    if more > 0 {
        let body = if more == 1 {
            "And 1 more reminder is due".to_string()
        } else {
            format!("And {more} more reminders are due")
        };
        show_popup(app, Popup::Summary, "Reminders", &body);
    }
    if fired {
        show_float_for_notification(app);
    }
}

/// The kinds of reminder popup, which differ in their buttons and in what a click does.
enum Popup {
    /// A due reminder: Snooze 10 min, Snooze 1 hour and Done. `sticky` keeps it on screen until answered.
    Due { task_id: String, sticky: bool },
    /// "You opened <app>": Done only.
    App { task_id: String },
    /// Reminders beyond the first few: no buttons; a click opens Today.
    Summary,
}

/// What a popup's button or click asks the main window to do with a reminder.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PopupAction {
    /// "snooze", "done", "open" or "today".
    action: &'static str,
    task_id: Option<String>,
    minutes: Option<u32>,
}

/// Turns a popup click into an action: `button` is the pressed button, `None` for the popup itself.
fn popup_action(task_id: Option<String>, button: Option<&str>) -> PopupAction {
    let (action, minutes) = match button {
        Some("snooze10") => ("snooze", Some(10)),
        Some("snooze60") => ("snooze", Some(60)),
        Some("done") => ("done", None),
        _ if task_id.is_some() => ("open", None),
        _ => ("today", None),
    };
    PopupAction { action, task_id, minutes }
}

/// The main window applies a popup's action, so Done works exactly like ticking off in RemMe.
fn popup_activated(app: &AppHandle, task_id: Option<String>, button: Option<&str>) {
    let action = popup_action(task_id, button);
    if matches!(action.action, "open" | "today") {
        show_main_window(app);
    }
    let _ = app.emit_to(MAIN, "popup-action", action);
}

/// Toasts of an installed app carry its id; a development build borrows PowerShell's,
/// since Windows only shows toasts for registered app ids. Same rule as the notification plugin.
#[cfg(windows)]
fn toast_app_id(app: &AppHandle) -> String {
    let dev = tauri::utils::platform::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.ends_with("target\\debug") || dir.ends_with("target\\release")))
        .unwrap_or(true);
    if dev {
        tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

#[cfg(windows)]
fn show_popup(app: &AppHandle, popup: Popup, heading: &str, body: &str) {
    use tauri_winrt_notification::{Scenario, Toast};
    let mut toast = Toast::new(&toast_app_id(app)).title(heading).text1(body);
    let task_id = match &popup {
        Popup::Due { task_id, sticky } => {
            toast = toast
                .add_button("Snooze 10 min", "snooze10")
                .add_button("Snooze 1 hour", "snooze60")
                .add_button("Done", "done");
            if *sticky {
                toast = toast.scenario(Scenario::Reminder);
            }
            Some(task_id.clone())
        }
        Popup::App { task_id } => {
            toast = toast.add_button("Done", "done");
            Some(task_id.clone())
        }
        Popup::Summary => None,
    };
    let handle = app.clone();
    let toast = toast.on_activated(move |button| {
        popup_activated(&handle, task_id.clone(), button.as_deref());
        Ok(())
    });
    if let Err(error) = toast.show() {
        eprintln!("Could not show a notification: {error}");
    }
}

#[cfg(not(windows))]
fn show_popup(app: &AppHandle, _popup: Popup, heading: &str, body: &str) {
    let _ = app.notification().builder().title(heading).body(body).show();
}

/// How an app is matched: "Chrome.exe", "chrome" and " chrome.EXE " are the same app.
fn app_key(name: &str) -> String {
    let name = name.trim().to_lowercase();
    name.strip_suffix(".exe").unwrap_or(&name).to_string()
}

/// Names of the apps running now, as `app_key`s.
fn running_apps_now(system: &mut System) -> HashSet<String> {
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    system.processes().values().map(|p| app_key(&p.name().to_string_lossy())).collect()
}

/// Returns `(app, task id, title)` for every unfinished task set to remind when one of the `started` apps opens.
fn app_triggered(data: &Value, started: &HashSet<String>) -> Vec<(String, String, String)> {
    let mut hits = Vec::new();
    for task in data["tasks"].as_array().into_iter().flatten() {
        let Some(app) = task["appTrigger"].as_str().filter(|a| !a.trim().is_empty()) else { continue };
        if task["completed"].as_bool().unwrap_or(false) || !started.contains(&app_key(app)) {
            continue;
        }
        let id = task["id"].as_str().unwrap_or("").to_string();
        let title = task["title"].as_str().unwrap_or("").trim();
        hits.push((app.trim().to_string(), id, if title.is_empty() { "Reminder".into() } else { title.into() }));
    }
    hits
}

fn has_app_triggers(data: &Value) -> bool {
    data["tasks"].as_array().into_iter().flatten().any(|task| {
        !task["completed"].as_bool().unwrap_or(false)
            && task["appTrigger"].as_str().is_some_and(|a| !a.trim().is_empty())
    })
}

/// Every few seconds, notifies for reminders tied to an app that has just started.
/// Processes are only scanned while some reminder waits for an app, and apps already
/// running when that scanning starts don't count as just started.
fn watch_apps(app: AppHandle) {
    let Ok(mut system) = System::new() else { return };
    let mut before: Option<HashSet<String>> = None;
    loop {
        thread::sleep(Duration::from_secs(3));
        if !has_app_triggers(&app.state::<AppState>().data.lock().unwrap()) {
            before = None;
            continue;
        }
        let now = running_apps_now(&mut system);
        let Some(previous) = before.replace(now.clone()) else { continue };
        let started: HashSet<String> = now.difference(&previous).cloned().collect();
        if started.is_empty() {
            continue;
        }
        let data = app.state::<AppState>().data.lock().unwrap().clone();
        let hits = app_triggered(&data, &started);
        for (name, id, title) in &hits {
            show_popup(&app, Popup::App { task_id: id.clone() }, &format!("You opened {name}"), title);
        }
        if !hits.is_empty() {
            show_float_for_notification(&app);
        }
    }
}

fn emit_float_state(app: &AppHandle) {
    let state = app.state::<AppState>();
    let ui = state.ui.lock().unwrap();
    let payload = FloatState { visible: ui.float_visible, locked: ui.float_locked };
    drop(ui);
    let _ = app.emit("float-state", payload);
}

fn set_float_visible(app: &AppHandle, visible: bool) {
    let Some(window) = app.get_webview_window(FLOAT) else { return };
    let state = app.state::<AppState>();
    let mut ui = state.ui.lock().unwrap();
    if visible {
        let _ = window.show();
        if !ui.float_locked {
            let _ = window.set_focus();
        }
    } else {
        let _ = window.hide();
    }
    ui.float_visible = visible;
    save_ui(&state, &ui);
    drop(ui);
    emit_float_state(app);
}

/// Brings up the floating list for a notification, without taking the keyboard
/// from the app the user is in. Does nothing if it is already showing.
fn show_float_for_notification(app: &AppHandle) {
    let Some(window) = app.get_webview_window(FLOAT) else { return };
    let state = app.state::<AppState>();
    let mut ui = state.ui.lock().unwrap();
    if ui.float_visible {
        return;
    }
    let previous = foreground_window();
    let _ = window.show();
    restore_foreground(app, previous);
    ui.float_visible = true;
    save_ui(&state, &ui);
    drop(ui);
    emit_float_state(app);
}

#[cfg(windows)]
fn foreground_window() -> isize {
    unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow().0 as isize }
}

#[cfg(not(windows))]
fn foreground_window() -> isize {
    0
}

/// Showing a window on Windows also activates it, so give the foreground back to
/// `previous` once the show has run. Both go through the event loop in order.
#[cfg(windows)]
fn restore_foreground(app: &AppHandle, previous: isize) {
    if previous == 0 {
        return;
    }
    let _ = app.run_on_main_thread(move || {
        use windows::Win32::{Foundation::HWND, UI::WindowsAndMessaging::SetForegroundWindow};
        let _ = unsafe { SetForegroundWindow(HWND(previous as *mut _)) };
    });
}

#[cfg(not(windows))]
fn restore_foreground(_app: &AppHandle, _previous: isize) {}

/// `#rrggbb` as a Windows COLORREF, which stores the channels as 0x00bbggrr.
fn colorref(hex: &str) -> Option<u32> {
    let hex = hex.trim().strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let rgb = u32::from_str_radix(hex, 16).ok()?;
    Some(((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16))
}

/// Colours the window's title bar to match the theme. `caption` and `text` are `#rrggbb`;
/// `None` gives Windows' own colour. `dark` gives the minimise, maximise and close buttons
/// their light-on-dark look. Windows 10 ignores the colours and only takes `dark`.
#[tauri::command]
fn set_title_bar(window: WebviewWindow, caption: Option<String>, text: Option<String>, dark: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::{
            Foundation::HWND,
            Graphics::Dwm::{
                DWMWA_CAPTION_COLOR, DWMWA_COLOR_DEFAULT, DWMWA_TEXT_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE,
                DwmSetWindowAttribute,
            },
        };
        let hwnd: HWND = window.hwnd().map_err(|e| e.to_string())?;
        // Windows reads this flag as a 32-bit BOOL.
        let dark = i32::from(dark);
        let caption = caption.as_deref().and_then(colorref).unwrap_or(DWMWA_COLOR_DEFAULT);
        let text = text.as_deref().and_then(colorref).unwrap_or(DWMWA_COLOR_DEFAULT);
        unsafe {
            DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark as *const _ as _, 4).map_err(|e| e.to_string())?;
            // Older Windows doesn't know these two; the light/dark switch above still applies.
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &caption as *const _ as _, 4);
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, &text as *const _ as _, 4);
        }
    }
    #[cfg(not(windows))]
    let _ = (window, caption, text, dark);
    Ok(())
}

/// The accent colour chosen in Windows Settings, as `#rrggbb`: the shade Windows uses on light
/// backgrounds and the one it uses on dark ones. `None` where Windows has no such colour.
#[derive(Serialize)]
struct Accent {
    light: String,
    dark: String,
}

#[tauri::command]
fn get_accent() -> Option<Accent> {
    #[cfg(windows)]
    {
        use windows::UI::ViewManagement::{UIColorType, UISettings};
        let settings = UISettings::new().ok()?;
        let hex = |kind: UIColorType| {
            settings.GetColorValue(kind).ok().map(|c| format!("#{:02x}{:02x}{:02x}", c.R, c.G, c.B))
        };
        Some(Accent { light: hex(UIColorType::AccentDark1)?, dark: hex(UIColorType::AccentLight2)? })
    }
    #[cfg(not(windows))]
    None
}

/// Asks Windows 11 to round a window's corners, or to leave them square. The floating list has
/// no frame, so Windows leaves it square unless asked; with Acrylic the window itself is what
/// shows, so its corners must be rounded by Windows. Windows 10 ignores this.
#[tauri::command]
fn set_round_corners(window: WebviewWindow, round: bool) {
    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Dwm::{
            DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND, DwmSetWindowAttribute,
        };
        let Ok(hwnd) = window.hwnd() else { return };
        let preference = if round { DWMWCP_ROUND } else { DWMWCP_DONOTROUND };
        unsafe {
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &preference as *const _ as _, 4);
        }
    }
    #[cfg(not(windows))]
    let _ = (window, round);
}

/// Puts what is due today in the tray icon's tooltip. The main window sends the counts whenever
/// they change, since it already works them out for the sidebar.
#[tauri::command]
fn set_tray_status(app: AppHandle, due_today: u32, overdue: u32) {
    {
        let state = app.state::<AppState>();
        let mut run = state.coach.lock().unwrap();
        run.due_today = due_today;
        run.overdue = overdue;
    }
    update_tray_tooltip(&app);
}

fn update_tray_tooltip(app: &AppHandle) {
    let state = app.state::<AppState>();
    let run = state.coach.lock().unwrap();
    let detail = match (run.due_today, run.overdue) {
        (0, _) => "Nothing due today".to_string(),
        (n, 0) => format!("{n} due today"),
        (n, late) => format!("{n} due today, {late} overdue"),
    };
    let coach = if run.state.enabled { format!("\nCoach: {}", run.state.label) } else { String::new() };
    if let Some(tray) = app.tray_by_id("tray") {
        let _ = tray.set_tooltip(Some(format!("RemMe: {detail}{coach}")));
    }
}

fn set_float_locked(app: &AppHandle, locked: bool) {
    let Some(window) = app.get_webview_window(FLOAT) else { return };
    let state = app.state::<AppState>();
    let mut ui = state.ui.lock().unwrap();
    let _ = window.set_ignore_cursor_events(locked);
    ui.float_locked = locked;
    let show = locked && !ui.float_visible;
    save_ui(&state, &ui);
    drop(ui);
    // Locking a hidden list would do nothing visible, so show it as well.
    if show {
        set_float_visible(app, true);
    } else {
        emit_float_state(app);
    }
}

fn toggle_float_visible(app: &AppHandle) {
    let visible = app.state::<AppState>().ui.lock().unwrap().float_visible;
    set_float_visible(app, !visible);
}

fn toggle_float_locked(app: &AppHandle) {
    let locked = app.state::<AppState>().ui.lock().unwrap().float_locked;
    set_float_locked(app, !locked);
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn parse_shortcut(text: &str) -> Result<Shortcut, String> {
    text.parse::<Shortcut>().map_err(|_| format!("\"{text}\" is not a valid shortcut."))
}

/// Replaces the registered hotkeys. On failure the previous hotkeys are restored.
fn register_shortcuts(app: &AppHandle, toggle: &str, lock: &str, pomodoro: &str) -> Result<(), String> {
    let wanted = [toggle, lock, pomodoro];
    let keys = wanted.iter().map(|text| parse_shortcut(text)).collect::<Result<Vec<_>, _>>()?;
    if keys[0] == keys[1] || keys[0] == keys[2] || keys[1] == keys[2] {
        return Err("Each shortcut must be different.".into());
    }

    let state = app.state::<AppState>();
    let mut current = state.shortcuts.lock().unwrap();
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let result = wanted.iter().zip(&keys).try_for_each(|(text, key)| {
        manager.register(*key).map_err(|_| format!("{text} is already used by another app."))
    });

    match result {
        Ok(()) => {
            current.toggle = Some((toggle.to_string(), keys[0]));
            current.lock = Some((lock.to_string(), keys[1]));
            current.pomodoro = Some((pomodoro.to_string(), keys[2]));
            Ok(())
        }
        Err(error) => {
            let _ = manager.unregister_all();
            for (_, key) in current.all() {
                let _ = manager.register(*key);
            }
            Err(error)
        }
    }
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Session lengths from the settings, in minutes, falling back to 25, 5 and 15.
fn timer_lengths(data: &Value) -> Lengths {
    let minutes = |key: &str, fallback: i64| {
        data["settings"][key].as_i64().filter(|m| (1..=180).contains(m)).unwrap_or(fallback)
    };
    Lengths::from_minutes(minutes("pomodoroFocus", 25), minutes("pomodoroShort", 5), minutes("pomodoroLong", 15))
}

fn emit_timer(app: &AppHandle) {
    let timer = app.state::<AppState>().timer.lock().unwrap().clone();
    let _ = app.emit("pomodoro", timer);
}

/// Runs `change` on the timer with the current lengths, then tells the windows.
/// What it returns is a phase that just ended, if any.
fn change_timer(app: &AppHandle, change: impl FnOnce(&mut Timer, Lengths, i64) -> Option<pomodoro::Finished>) {
    let state = app.state::<AppState>();
    let lengths = timer_lengths(&state.data.lock().unwrap());
    let finished = change(&mut state.timer.lock().unwrap(), lengths, now_ms());
    if let Some(finished) = finished {
        announce(app, &finished, lengths);
    }
    emit_timer(app);
}

/// Notifies about a phase that ended and records today's count.
fn announce(app: &AppHandle, finished: &pomodoro::Finished, lengths: Lengths) {
    let state = app.state::<AppState>();
    let timer = state.timer.lock().unwrap().clone();
    let (title, body) = match (finished.phase, finished.next) {
        (Phase::Focus, next) => {
            let minutes = if next == Phase::LongBreak { lengths.long_break } else { lengths.short_break } / 60_000;
            let kind = if next == Phase::LongBreak { "long break" } else { "break" };
            (
                if finished.counted { "Focus session done" } else { "Focus session skipped" },
                format!("Time for a {minutes}-minute {kind}."),
            )
        }
        _ => ("Break over", "Start your next focus session when you're ready.".to_string()),
    };
    let _ = app.notification().builder().title(title).body(&body).show();
    let _ = app.emit("pomodoro-done", finished.clone());

    let mut ui = state.ui.lock().unwrap();
    ui.pomodoro_day = timer.day;
    ui.pomodoro_today = timer.today;
    save_ui(&state, &ui);
}

/// Ends phases whose time is up. Runs for as long as the app does.
fn run_timer(app: AppHandle) {
    loop {
        thread::sleep(Duration::from_millis(500));
        let state = app.state::<AppState>();
        let lengths = timer_lengths(&state.data.lock().unwrap());
        let (finished, new_day) = {
            let mut timer = state.timer.lock().unwrap();
            let before = timer.day.clone();
            let finished = timer.tick(lengths, now_ms(), &today());
            (finished, before != timer.day)
        };
        if let Some(finished) = &finished {
            announce(&app, finished, lengths);
        }
        if finished.is_some() || new_day {
            emit_timer(&app);
        }
    }
}

#[tauri::command]
fn pomodoro_state(state: State<AppState>) -> Timer {
    state.timer.lock().unwrap().clone()
}

/// Starts a focus session now, on `task_id` if given.
#[tauri::command]
fn pomodoro_start(app: AppHandle, task_id: Option<String>) {
    change_timer(&app, |timer, lengths, now| {
        timer.start_focus(task_id, lengths, now);
        None
    });
}

#[tauri::command]
fn pomodoro_toggle(app: AppHandle) {
    change_timer(&app, |timer, lengths, now| {
        timer.toggle(lengths, now);
        None
    });
}

#[tauri::command]
fn pomodoro_skip(app: AppHandle) {
    change_timer(&app, |timer, lengths, now| timer.skip(lengths, now));
}

#[tauri::command]
fn pomodoro_reset(app: AppHandle) {
    change_timer(&app, |timer, _, _| {
        timer.reset();
        None
    });
}

#[tauri::command]
fn load_data(state: State<AppState>) -> Value {
    state.data.lock().unwrap().clone()
}

#[tauri::command]
fn save_data(app: AppHandle, window: WebviewWindow, state: State<AppState>, data: Value) -> Result<(), String> {
    ensure_daily_backup(&state);
    write_json(&state.dir.join(DATA_FILE), &data)?;
    *state.data.lock().unwrap() = data.clone();
    app.emit("data-changed", DataChanged { source: window.label().to_string(), data })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_shortcuts(app: AppHandle, toggle: String, lock: String, pomodoro: String) -> Result<(), String> {
    register_shortcuts(&app, &toggle, &lock, &pomodoro)
}

/// Turns the hotkeys off while the settings screen records new keys, so pressing
/// the current combination reaches the page instead of toggling the floating list.
#[tauri::command]
fn suspend_shortcuts(app: AppHandle, suspended: bool) -> Result<(), String> {
    if suspended {
        return app.global_shortcut().unregister_all().map_err(|e| e.to_string());
    }
    let state = app.state::<AppState>();
    let current = state.shortcuts.lock().unwrap();
    for (text, key) in current.all() {
        app.global_shortcut()
            .register(*key)
            .map_err(|_| format!("{text} is already used by another app."))?;
    }
    Ok(())
}

#[tauri::command]
fn get_float_state(state: State<AppState>) -> FloatState {
    let ui = state.ui.lock().unwrap();
    FloatState { visible: ui.float_visible, locked: ui.float_locked }
}

#[tauri::command]
fn set_float(app: AppHandle, visible: Option<bool>, locked: Option<bool>) {
    if let Some(visible) = visible {
        set_float_visible(&app, visible);
    }
    if let Some(locked) = locked {
        set_float_locked(&app, locked);
    }
}

#[tauri::command]
fn show_main(app: AppHandle) {
    show_main_window(&app);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupInfo {
    name: String,
    kind: Kind,
    /// Local time, `yyyy-mm-ddThh:mm:ss`.
    taken_at: String,
    /// `None` when the file can't be read as RemMe data.
    reminders: Option<usize>,
    lists: Option<usize>,
}

fn counts(data: &Value) -> (usize, usize) {
    let len = |key: &str| data[key].as_array().map_or(0, Vec::len);
    (len("tasks"), len("lists"))
}

#[tauri::command]
fn list_backups(state: State<AppState>) -> Vec<BackupInfo> {
    backup::list(&backup_dir(&state))
        .into_iter()
        .map(|b| {
            let found = backup::read_data(&b.path).map(|data| counts(&data));
            BackupInfo {
                name: b.name,
                kind: b.kind,
                taken_at: b.taken.format("%Y-%m-%dT%H:%M:%S").to_string(),
                reminders: found.map(|c| c.0),
                lists: found.map(|c| c.1),
            }
        })
        .collect()
}

/// A backup in the local folder, found by its file name so no other path can be passed in.
fn find_backup(state: &AppState, name: &str) -> Result<backup::Backup, String> {
    backup::list(&backup_dir(state))
        .into_iter()
        .find(|b| b.name == name)
        .ok_or_else(|| "That backup no longer exists.".to_string())
}

#[tauri::command]
fn backup_now(state: State<AppState>) -> Result<(), String> {
    make_backup(&state, &current_data_text(&state), Kind::Manual).map(|_| ())
}

#[tauri::command]
fn restore_backup(app: AppHandle, name: String) -> Result<(), String> {
    let found = find_backup(&app.state::<AppState>(), &name)?;
    let data = backup::read_data(&found.path).ok_or("That backup can't be read.")?;
    replace_data(&app, data, Kind::BeforeRestore)
}

#[tauri::command]
fn delete_backup(state: State<AppState>, name: String) -> Result<(), String> {
    let found = find_backup(&state, &name)?;
    if found.kind != Kind::Manual {
        return Err("Only backups you made yourself can be deleted.".to_string());
    }
    fs::remove_file(&found.path).map_err(|e| format!("Could not delete the backup: {e}"))
}

#[tauri::command]
fn open_backup_folder(state: State<AppState>) -> Result<(), String> {
    let dir = backup_dir(&state);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::process::Command::new("explorer").arg(&dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Asks where to save, then writes the current data there. `false` if the dialog was cancelled.
#[tauri::command]
async fn export_data(app: AppHandle, window: WebviewWindow) -> Result<bool, String> {
    let name = format!("RemMe export {}.json", Local::now().format("%Y-%m-%d"));
    let Some(chosen) = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export reminders")
        .set_file_name(&name)
        .add_filter("RemMe backup", &["json"])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    let state = app.state::<AppState>();
    let text = current_data_text(&state);
    fs::write(&path, text).map_err(|e| format!("Could not save {}: {e}", path.display()))?;
    Ok(true)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportFile {
    path: String,
    reminders: usize,
    lists: usize,
}

/// Asks for a file and checks it is RemMe data, without changing anything yet.
#[tauri::command]
async fn pick_import_file(app: AppHandle, window: WebviewWindow) -> Result<Option<ImportFile>, String> {
    let Some(chosen) = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Import reminders")
        .add_filter("RemMe backup", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    let data = backup::read_data(&path).ok_or("That file isn't a RemMe backup.")?;
    let (reminders, lists) = counts(&data);
    Ok(Some(ImportFile { path: path.display().to_string(), reminders, lists }))
}

#[tauri::command]
fn import_data(app: AppHandle, path: String) -> Result<(), String> {
    let data = backup::read_data(Path::new(&path)).ok_or("That file isn't a RemMe backup.")?;
    replace_data(&app, data, Kind::BeforeImport)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupFolder {
    folder: Option<String>,
    error: Option<String>,
}

fn backup_folder_of(state: &AppState) -> BackupFolder {
    let ui = state.ui.lock().unwrap();
    BackupFolder { folder: ui.backup_folder.clone(), error: ui.backup_folder_error.clone() }
}

#[tauri::command]
fn get_backup_folder(state: State<AppState>) -> BackupFolder {
    backup_folder_of(&state)
}

/// Asks for a second backup folder and copies the existing backups into it.
#[tauri::command]
async fn choose_backup_folder(app: AppHandle, window: WebviewWindow) -> Result<BackupFolder, String> {
    let state = app.state::<AppState>();
    let Some(chosen) = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Also back up to")
        .blocking_pick_folder()
    else {
        return Ok(backup_folder_of(&state));
    };
    let folder = chosen.into_path().map_err(|e| e.to_string())?;
    let second = folder.join(backup::SECOND_DIR);
    fs::create_dir_all(&second).map_err(|e| format!("Could not use {}: {e}", folder.display()))?;
    for found in backup::list(&backup_dir(&state)) {
        let target = second.join(&found.name);
        if !target.exists() {
            fs::copy(&found.path, &target).map_err(|e| format!("Could not copy to {}: {e}", folder.display()))?;
        }
    }
    {
        let mut ui = state.ui.lock().unwrap();
        ui.backup_folder = Some(folder.display().to_string());
        ui.backup_folder_error = None;
        save_ui(&state, &ui);
    }
    Ok(backup_folder_of(&state))
}

#[tauri::command]
fn clear_backup_folder(state: State<AppState>) -> BackupFolder {
    {
        let mut ui = state.ui.lock().unwrap();
        ui.backup_folder = None;
        ui.backup_folder_error = None;
        save_ui(&state, &ui);
    }
    backup_folder_of(&state)
}

#[tauri::command]
fn get_recovery(state: State<AppState>) -> Option<Recovery> {
    state.ui.lock().unwrap().recovery.clone()
}

#[tauri::command]
fn dismiss_recovery(state: State<AppState>) {
    let mut ui = state.ui.lock().unwrap();
    ui.recovery = None;
    save_ui(&state, &ui);
}

/// Names of running apps, for picking which one a reminder waits for.
/// Async so the process scan runs off the main thread and never freezes the windows.
#[tauri::command]
async fn running_apps() -> Vec<String> {
    let Ok(mut system) = System::new() else { return Vec::new() };
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    let mut seen = HashSet::new();
    let mut names: Vec<String> = system
        .processes()
        .values()
        .map(|p| p.name().to_string_lossy().into_owned())
        .filter(|name| name.to_lowercase().ends_with(".exe") && seen.insert(app_key(name)))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names
}

/// The tray menu. With Coach on it gets a Coach submenu to pause or resume it (Coach is
/// switched off only in Settings, so it can't be turned off on a whim).
fn tray_menu(app: &AppHandle, coach_on: bool, paused: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Open RemMe", true, None::<&str>)?;
    let add = MenuItem::with_id(app, "add", "Add reminder…", true, None::<&str>)?;
    let float = MenuItem::with_id(app, "float", "Show or hide floating list", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Lock or unlock floating list", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    if !coach_on {
        return Menu::with_items(app, &[&open, &add, &sep()?, &float, &lock, &sep()?, &quit]);
    }
    let p15 = MenuItem::with_id(app, "coach-15", "Pause for 15 minutes", true, None::<&str>)?;
    let p60 = MenuItem::with_id(app, "coach-60", "Pause for 1 hour", true, None::<&str>)?;
    let pday = MenuItem::with_id(app, "coach-day", "Pause for the rest of the day", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "coach-resume", "Resume Coach", paused, None::<&str>)?;
    let coach_menu = Submenu::with_items(app, "Coach", true, &[&p15, &p60, &pday, &sep()?, &resume])?;
    Menu::with_items(app, &[&open, &add, &sep()?, &float, &lock, &sep()?, &coach_menu, &sep()?, &quit])
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = tray_menu(app, false, false)?;

    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon is bundled"))
        .tooltip("RemMe")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "add" => {
                show_main_window(app);
                let _ = app.emit_to(MAIN, "new-reminder", ());
            }
            "float" => toggle_float_visible(app),
            "lock" => toggle_float_locked(app),
            "coach-15" => coach_pause(app.clone(), Some(15)),
            "coach-60" => coach_pause(app.clone(), Some(60)),
            "coach-day" => coach_pause(app.clone(), None),
            "coach-resume" => coach_resume(app.clone()),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// ---------- Coach ----------

/// The front window's process name and title, and whether that's the "coach" popup itself.
#[cfg(windows)]
fn front_window() -> Option<(String, String)> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut text = [0u16; 512];
        let n = GetWindowTextW(hwnd, &mut text).max(0) as usize;
        let title = String::from_utf16_lossy(&text[..n]);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut path = [0u16; 1024];
        let mut len = path.len() as u32;
        let got = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(path.as_mut_ptr()), &mut len);
        let _ = CloseHandle(process);
        got.ok()?;
        let path = String::from_utf16_lossy(&path[..len as usize]);
        let name = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
        Some((name, title))
    }
}

#[cfg(not(windows))]
fn front_window() -> Option<(String, String)> {
    None
}

/// Seconds since the last mouse or keyboard input, anywhere.
#[cfg(windows)]
fn idle_secs() -> u64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    unsafe {
        if !GetLastInputInfo(&mut info).as_bool() {
            return 0;
        }
        (GetTickCount().wrapping_sub(info.dwTime) / 1000) as u64
    }
}

#[cfg(not(windows))]
fn idle_secs() -> u64 {
    0
}

/// When the current focus session ends, if one is on (running or paused).
fn session_end(timer: &Timer, now_ms: i64) -> Option<NaiveDateTime> {
    if timer.phase != Phase::Focus {
        return None;
    }
    let ends = timer.ends_at.unwrap_or(now_ms + timer.remaining);
    DateTime::from_timestamp_millis(ends).map(|t| t.with_timezone(&Local).naive_local())
}

/// Tells the windows and the tray about Coach's state when it changes.
fn publish_coach_state(app: &AppHandle, next: CoachState) {
    let (menu_changed, marker_changed, paused) = {
        let state = app.state::<AppState>();
        let mut run = state.coach.lock().unwrap();
        if run.state == next && run.menu_on.is_some() {
            return;
        }
        let menu_key = next.enabled;
        let menu_changed = run.menu_on != Some(menu_key) || run.state.paused != next.paused;
        let marker_changed = run.marked != Some(next.watching);
        run.menu_on = Some(menu_key);
        run.marked = Some(next.watching);
        run.state = next.clone();
        (menu_changed, marker_changed, next.paused)
    };
    let _ = app.emit("coach-state", next.clone());
    if let Some(tray) = app.tray_by_id("tray") {
        if menu_changed {
            if let Ok(menu) = tray_menu(app, next.enabled, paused) {
                let _ = tray.set_menu(Some(menu));
            }
        }
        if marker_changed {
            if let Some(icon) = tray_icon(app, next.watching) {
                let _ = tray.set_icon(Some(icon));
            }
        }
    }
    update_tray_tooltip(app);
}

/// The app icon, with a small amber dot in its corner while Coach is watching.
fn tray_icon(app: &AppHandle, marked: bool) -> Option<tauri::image::Image<'static>> {
    let base = app.default_window_icon()?;
    let (w, h) = (base.width(), base.height());
    let mut rgba = base.rgba().to_vec();
    if marked {
        let r = (w.min(h) as f32 * 0.22).max(3.0);
        let (cx, cy) = (w as f32 - r - 1.0, h as f32 - r - 1.0);
        for y in 0..h {
            for x in 0..w {
                let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
                let i = ((y * w + x) * 4) as usize;
                if d <= r {
                    rgba[i..i + 4].copy_from_slice(&[0xF5, 0x9E, 0x0B, 0xFF]);
                } else if d <= r + 1.2 {
                    rgba[i..i + 4].copy_from_slice(&[0x20, 0x20, 0x20, 0xFF]);
                }
            }
        }
    }
    Some(tauri::image::Image::new_owned(rgba, w, h))
}

/// Every 5 seconds: is it focus time, and are you off track? Climbs the ladder and shows Coach's popup.
fn run_coach(app: AppHandle) {
    loop {
        thread::sleep(Duration::from_secs(5));
        coach_check(&app);
    }
}

fn coach_check(app: &AppHandle) {
    let state = app.state::<AppState>();
    let data = state.data.lock().unwrap().clone();
    let settings = coach::settings(&data);
    let now = local_now();
    if !settings.enabled {
        state.coach.lock().unwrap().ladder.leave();
        publish_coach_state(app, CoachState { enabled: false, ..CoachState::default() });
        return;
    }
    let paused_until = {
        let mut ui = state.ui.lock().unwrap();
        let now_s = Utc::now().timestamp();
        match ui.coach_paused_until {
            Some(until) if until > now_s => Some(until),
            Some(_) => {
                ui.coach_paused_until = None;
                save_ui(&state, &ui);
                None
            }
            None => None,
        }
    };
    if let Some(until) = paused_until {
        state.coach.lock().unwrap().ladder.restart();
        let until = DateTime::from_timestamp(until, 0).map(|t| t.with_timezone(&Local).naive_local()).unwrap_or(now);
        publish_coach_state(app, CoachState { enabled: true, watching: false, paused: true, label: format!("paused until {}", coach::clock(until)) });
        return;
    }
    let (session_ends, session_task) = {
        let timer = state.timer.lock().unwrap();
        (session_end(&timer, now_ms()), timer.task_id.clone())
    };
    let overdue = coach::any_overdue(&data, now);
    let Some(block) = coach::focus_block(&settings, now, session_ends, overdue) else {
        state.coach.lock().unwrap().ladder.leave();
        publish_coach_state(app, CoachState { enabled: true, label: "on, waiting for focus time".into(), ..CoachState::default() });
        return;
    };
    let label = match block.ends {
        Some(end) if session_ends == Some(end) && !block.key.starts_with("hours:") => "watching until this focus session ends".into(),
        Some(end) => format!("watching until {}", coach::clock(end)),
        None => "watching while something is overdue".into(),
    };
    publish_coach_state(app, CoachState { enabled: true, watching: true, paused: false, label });

    let reading = match front_window() {
        Some((app_name, title)) => coach::classify(&app_name, &title, idle_secs(), &settings),
        None => coach::classify("", "", idle_secs(), &settings),
    };
    let (step, real_talk) = {
        let mut run = state.coach.lock().unwrap();
        let step = run.ladder.tick(Utc::now().timestamp(), &block.key, &reading, &settings);
        (step, run.ladder.real_talk)
    };
    let Some(step) = step else { return };
    let session_task = session_ends.and(session_task);
    let named = coach::pick_reminder(&data, session_task.as_deref(), now);
    let distraction = match reading {
        coach::Reading::Distraction(name) => Some(name),
        _ => None,
    };
    show_coach_popup(app, CoachStep { step, named, distraction, real_talk });
}

/// Shows Coach's popup in the bottom-right of the monitor you're using, without taking focus.
fn show_coach_popup(app: &AppHandle, step: CoachStep) {
    let Some(window) = app.get_webview_window(COACH) else { return };
    let previous = foreground_window();
    let push = matches!(step.step, coach::Step::Push);
    let (w, h) = if push { (380.0, 184.0) } else { (340.0, 164.0) };
    let _ = window.set_size(tauri::LogicalSize::new(w, h));
    if let Some(area) = work_area_of(previous) {
        let scale = window.scale_factor().unwrap_or(1.0);
        let (pw, ph) = ((w * scale) as i32, (h * scale) as i32);
        let margin = (16.0 * scale) as i32;
        let _ = window.set_position(tauri::PhysicalPosition::new(area.2 - pw - margin, area.3 - ph - margin));
    }
    let _ = app.emit_to(COACH, "coach-step", step);
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    restore_foreground(app, previous);
}

/// The work area (left, top, right, bottom, in pixels) of the monitor showing `hwnd`.
#[cfg(windows)]
fn work_area_of(hwnd: isize) -> Option<(i32, i32, i32, i32)> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY};
    unsafe {
        let monitor = MonitorFromWindow(HWND(hwnd as *mut _), MONITOR_DEFAULTTOPRIMARY);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        let r = info.rcWork;
        Some((r.left, r.top, r.right, r.bottom))
    }
}

#[cfg(not(windows))]
fn work_area_of(_hwnd: isize) -> Option<(i32, i32, i32, i32)> {
    None
}

#[tauri::command]
fn coach_state(state: State<AppState>) -> CoachState {
    state.coach.lock().unwrap().state.clone()
}

/// An answer from Coach's popup: "back" (show the reminder), "focus" (start a focus session on it) or "dismiss".
#[tauri::command]
fn coach_answer(app: AppHandle, answer: String, task_id: Option<String>) {
    if let Some(window) = app.get_webview_window(COACH) {
        let _ = window.hide();
    }
    match answer.as_str() {
        "back" => {
            show_main_window(&app);
            if task_id.is_some() {
                let _ = app.emit_to(MAIN, "popup-action", PopupAction { action: "open", task_id, minutes: None });
            }
        }
        "focus" => {
            app.state::<AppState>().coach.lock().unwrap().ladder.restart();
            pomodoro_start(app.clone(), task_id);
        }
        _ => {}
    }
}

/// Pauses Coach for `minutes`, or until midnight.
#[tauri::command]
fn coach_pause(app: AppHandle, minutes: Option<i64>) {
    let until = match minutes {
        Some(m) => Utc::now().timestamp() + m.clamp(1, 24 * 60) * 60,
        None => coach::end_of_day(local_now()).and_local_timezone(Local).earliest().map_or(Utc::now().timestamp() + 3600, |t| t.timestamp()),
    };
    {
        let state = app.state::<AppState>();
        let mut ui = state.ui.lock().unwrap();
        ui.coach_paused_until = Some(until);
        save_ui(&state, &ui);
    }
    if let Some(window) = app.get_webview_window(COACH) {
        let _ = window.hide();
    }
    coach_check(&app);
}

#[tauri::command]
fn coach_resume(app: AppHandle) {
    {
        let state = app.state::<AppState>();
        let mut ui = state.ui.lock().unwrap();
        ui.coach_paused_until = None;
        save_ui(&state, &ui);
    }
    coach_check(&app);
}

// ---------- Coach's voice ----------

fn set_voice_status(app: &AppHandle, status: voice::Status) {
    app.state::<AppState>().voice.lock().unwrap().status = status.clone();
    let _ = app.emit("voice-status", status);
}

#[tauri::command]
fn voice_status(state: State<AppState>) -> voice::Status {
    state.voice.lock().unwrap().status.clone()
}

/// Downloads the voice in the background, reporting progress as `voice-status` events.
#[tauri::command]
fn voice_download(app: AppHandle) {
    {
        let state = app.state::<AppState>();
        let run = state.voice.lock().unwrap();
        if matches!(run.status, voice::Status::Downloading { .. }) {
            return;
        }
    }
    let total = voice::total_size();
    set_voice_status(&app, voice::Status::Downloading { done: 0, total });
    thread::spawn(move || {
        let dir = app.state::<AppState>().dir.join(VOICE_DIR);
        let mut last = std::time::Instant::now();
        let result = voice::download(&dir, |done, total| {
            if last.elapsed() >= Duration::from_millis(250) {
                last = std::time::Instant::now();
                set_voice_status(&app, voice::Status::Downloading { done, total });
            }
        });
        match result {
            Ok(()) => {
                app.state::<AppState>().voice.lock().unwrap().verified = true;
                set_voice_status(&app, voice::Status::Ready);
            }
            Err(message) => set_voice_status(&app, voice::Status::Error { message }),
        }
    });
}

/// Deletes the voice files and frees the space.
#[tauri::command]
fn voice_remove(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut run = state.voice.lock().unwrap();
        if matches!(run.status, voice::Status::Downloading { .. }) {
            return Err("Wait for the download to finish first.".into());
        }
        run.engine = None;
        run.verified = false;
    }
    voice::remove(&state.dir.join(VOICE_DIR)).map_err(|e| format!("Couldn't remove the voice: {e}"))?;
    set_voice_status(&app, voice::Status::None);
    Ok(())
}

/// Speaks a line: 24 kHz mono samples as little-endian f32 bytes. The first call in a session
/// checks every file's fingerprint and loads the model.
#[tauri::command]
async fn voice_speak(app: AppHandle, text: String, voice: String, speed: f32) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let dir = state.dir.join(VOICE_DIR);
        let mut run = state.voice.lock().unwrap();
        if run.status != voice::Status::Ready {
            return Err("The voice isn't downloaded.".to_string());
        }
        if !run.verified {
            if !voice::verify_all(&dir) {
                drop(run);
                let _ = voice::remove(&dir);
                set_voice_status(&app, voice::Status::Error { message: "The voice files didn't match their fingerprints, so they were removed. Download them again.".into() });
                return Err("The voice files failed their check.".into());
            }
            run.verified = true;
        }
        if run.engine.is_none() {
            run.engine = Some(voice::Engine::load(&dir)?);
        }
        let samples = run.engine.as_mut().unwrap().speak(&dir, &text, &voice, speed)?;
        let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let state = app.state::<AppState>();
            let current = state.shortcuts.lock().unwrap();
            let is_toggle = current.toggle.as_ref().is_some_and(|(_, key)| key == shortcut);
            let is_lock = current.lock.as_ref().is_some_and(|(_, key)| key == shortcut);
            let is_pomodoro = current.pomodoro.as_ref().is_some_and(|(_, key)| key == shortcut);
            drop(current);
            if is_toggle {
                toggle_float_visible(app);
            } else if is_lock {
                toggle_float_locked(app);
            } else if is_pomodoro {
                pomodoro_toggle(app.clone());
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        .difference(tauri_plugin_window_state::StateFlags::VISIBLE),
                )
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(shortcut_plugin)
        .invoke_handler(tauri::generate_handler![
            coach_state,
            coach_answer,
            coach_pause,
            coach_resume,
            voice_status,
            voice_download,
            voice_remove,
            voice_speak,
            load_data,
            save_data,
            set_shortcuts,
            suspend_shortcuts,
            get_float_state,
            set_float,
            show_main,
            running_apps,
            pomodoro_state,
            pomodoro_start,
            pomodoro_toggle,
            pomodoro_skip,
            pomodoro_reset,
            set_title_bar,
            get_accent,
            set_round_corners,
            set_tray_status,
            list_backups,
            backup_now,
            restore_backup,
            delete_backup,
            open_backup_folder,
            export_data,
            pick_import_file,
            import_data,
            get_backup_folder,
            choose_backup_folder,
            clear_backup_folder,
            get_recovery,
            dismiss_recovery
        ])
        .on_window_event(|window, event| {
            // Closing a window hides it; the app keeps running in the tray until Quit.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == FLOAT {
                    set_float_visible(window.app_handle(), false);
                } else {
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            if let Some(old_dir) = dir.parent().map(|parent| parent.join(OLD_DATA_DIR)) {
                if let Err(error) = copy_old_data(&old_dir, &dir) {
                    eprintln!("Could not copy data from {}: {error}", old_dir.display());
                }
            }
            fs::create_dir_all(&dir)?;
            let mut ui = read_json::<UiState>(&dir.join(UI_FILE)).unwrap_or_default();
            let data = load_or_recover(&dir, &mut ui);
            if ui.recovery.is_some() {
                let _ = write_json(&dir.join(UI_FILE), &ui);
            }
            let toggle = setting(&data, "toggleShortcut", DEFAULT_TOGGLE);
            let lock = setting(&data, "lockShortcut", DEFAULT_LOCK);
            let pomodoro_key = setting(&data, "pomodoroShortcut", DEFAULT_POMODORO);
            let day = today();
            let timer = Timer {
                today: if ui.pomodoro_day == day { ui.pomodoro_today } else { 0 },
                day,
                ..Timer::default()
            };
            let (float_visible, float_locked) = (ui.float_visible, ui.float_locked);
            app.manage(AppState {
                dir,
                data: Mutex::new(data),
                ui: Mutex::new(ui),
                shortcuts: Mutex::new(Shortcuts::default()),
                timer: Mutex::new(timer),
                coach: Mutex::new(CoachRun::default()),
                voice: Mutex::new(VoiceRun { engine: None, status: voice::Status::None, verified: false }),
            });
            {
                let state = app.state::<AppState>();
                let status = voice::status_from_disk(&state.dir.join(VOICE_DIR));
                state.voice.lock().unwrap().status = status;
            }

            let handle = app.handle().clone();
            ensure_daily_backup(&handle.state::<AppState>());
            if let Err(error) = register_shortcuts(&handle, &toggle, &lock, &pomodoro_key) {
                eprintln!("{error}");
            }
            build_tray(&handle)?;

            if !std::env::args().any(|arg| arg == "--minimized") {
                show_main_window(&handle);
            }
            if let Some(float) = handle.get_webview_window(FLOAT) {
                let _ = float.set_ignore_cursor_events(float_locked);
                if float_visible {
                    let _ = float.show();
                }
            }

            let ticker = handle.clone();
            thread::spawn(move || run_timer(ticker));
            let watcher = handle.clone();
            thread::spawn(move || watch_apps(watcher));
            let coach_handle = handle.clone();
            thread::spawn(move || run_coach(coach_handle));
            thread::spawn(move || loop {
                check_reminders(&handle);
                thread::sleep(Duration::from_secs(15));
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running RemMe");
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-27T12:00:00Z").unwrap().with_timezone(&Utc)
    }

    #[test]
    fn past_unfinished_tasks_are_due() {
        let data = json!({ "tasks": [
            { "id": "a", "title": "Pay bills", "dueAt": "2026-10-27T11:59:00Z", "completed": false },
            { "id": "b", "title": "Later", "dueAt": "2026-10-27T12:01:00Z", "completed": false },
            { "id": "c", "title": "Done", "dueAt": "2026-10-27T08:00:00Z", "completed": true },
            { "id": "d", "title": "No date", "dueAt": null, "completed": false }
        ]});
        let (due, keys) = due_tasks(&data, now());
        assert_eq!(
            due,
            vec![DueTask {
                id: "a".into(),
                key: "a|2026-10-27T11:59:00Z".into(),
                title: "Pay bills".into(),
                nag_minutes: None,
                snooze_key: None,
            }]
        );
        assert_eq!(keys.len(), 3);
    }

    #[test]
    fn due_time_is_compared_across_time_zones() {
        let data = json!({ "tasks": [
            { "id": "a", "title": "", "dueAt": "2026-10-27T19:30:00+08:00", "completed": false }
        ]});
        let (due, _) = due_tasks(&data, now());
        assert_eq!(due[0].title, "Reminder");
    }

    #[test]
    fn invalid_dates_are_ignored() {
        let data = json!({ "tasks": [ { "id": "a", "title": "x", "dueAt": "tomorrow", "completed": false } ] });
        let (due, keys) = due_tasks(&data, now());
        assert!(due.is_empty() && keys.is_empty());
    }

    #[test]
    fn nagging_tasks_notify_again_after_their_interval() {
        let data = json!({ "tasks": [
            { "id": "a", "title": "x", "dueAt": "2026-10-27T11:00:00Z", "completed": false, "nagMinutes": 10 },
            { "id": "b", "title": "y", "dueAt": "2026-10-27T11:00:00Z", "completed": false, "nagMinutes": null }
        ]});
        let (due, _) = due_tasks(&data, now());
        let (nag, plain) = (&due[0], &due[1]);
        assert_eq!(nag.nag_minutes, Some(10));

        let mut ui = UiState::default();
        let t = now().timestamp();
        assert!(should_notify(nag, &ui, t) && should_notify(plain, &ui, t));

        ui.notified = vec![nag.key.clone(), plain.key.clone()];
        ui.last_nag.insert(nag.key.clone(), t);
        assert!(!should_notify(nag, &ui, t + 9 * 60));
        assert!(should_notify(nag, &ui, t + 10 * 60));
        assert!(!should_notify(plain, &ui, t + 60 * 60));
    }

    #[test]
    fn a_snoozed_task_waits_then_notifies_once_more() {
        let data = json!({ "tasks": [
            { "id": "a", "title": "x", "dueAt": "2026-10-27T11:00:00Z", "completed": false,
              "snoozedUntil": "2026-10-27T12:10:00Z" }
        ]});
        let (due, keys) = due_tasks(&data, now());
        assert!(due.is_empty(), "still snoozed");
        assert!(keys.contains("a|snooze|2026-10-27T12:10:00Z"), "the snooze key isn't pruned while snoozed");

        let later = now() + chrono::Duration::minutes(15);
        let (due, _) = due_tasks(&data, later);
        let task = &due[0];
        let mut ui = UiState { notified: vec![task.key.clone()], ..UiState::default() };
        assert!(should_notify(task, &ui, later.timestamp()), "the ended snooze notifies again");
        ui.notified.push(task.snooze_key.clone().unwrap());
        assert!(!should_notify(task, &ui, later.timestamp()), "but only once");
    }

    #[test]
    fn popup_clicks_become_actions() {
        let id = || Some("a".to_string());
        let check = |a: PopupAction| (a.action, a.task_id, a.minutes);
        assert_eq!(check(popup_action(id(), Some("snooze10"))), ("snooze", id(), Some(10)));
        assert_eq!(check(popup_action(id(), Some("snooze60"))), ("snooze", id(), Some(60)));
        assert_eq!(check(popup_action(id(), Some("done"))), ("done", id(), None));
        assert_eq!(check(popup_action(id(), None)), ("open", id(), None));
        assert_eq!(check(popup_action(None, None)), ("today", None, None));
    }

    #[test]
    fn app_names_match_loosely() {
        assert_eq!(app_key(" Chrome.EXE "), "chrome");
        assert_eq!(app_key("chrome"), "chrome");
    }

    #[test]
    fn unfinished_tasks_for_a_started_app_trigger() {
        let data = json!({ "tasks": [
            { "id": "a", "title": "Log hours", "appTrigger": "Teams.exe", "completed": false },
            { "id": "b", "title": "Done", "appTrigger": "teams", "completed": true },
            { "id": "c", "title": "Other", "appTrigger": "chrome", "completed": false },
            { "id": "d", "title": "None", "appTrigger": null, "completed": false }
        ]});
        let started = HashSet::from(["teams".to_string()]);
        assert_eq!(
            app_triggered(&data, &started),
            vec![("Teams.exe".to_string(), "a".to_string(), "Log hours".to_string())]
        );
    }

    #[test]
    fn only_unfinished_tasks_with_an_app_need_scanning() {
        assert!(!has_app_triggers(&json!({ "tasks": [
            { "id": "a", "appTrigger": "teams", "completed": true },
            { "id": "b", "appTrigger": "  ", "completed": false },
            { "id": "c", "completed": false }
        ]})));
        assert!(has_app_triggers(&json!({ "tasks": [ { "id": "a", "appTrigger": "teams", "completed": false } ] })));
    }

    #[test]
    fn old_data_is_copied_once_and_never_over_new_data() {
        let root = std::env::temp_dir().join(format!("remme-copy-test-{}", std::process::id()));
        let (old_dir, dir) = (root.join("old"), root.join("new"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&old_dir).unwrap();
        fs::write(old_dir.join(DATA_FILE), "old").unwrap();
        fs::write(old_dir.join(UI_FILE), "ui").unwrap();

        assert!(copy_old_data(&old_dir, &dir).unwrap());
        assert_eq!(fs::read_to_string(dir.join(DATA_FILE)).unwrap(), "old");
        assert_eq!(fs::read_to_string(dir.join(UI_FILE)).unwrap(), "ui");

        fs::write(dir.join(DATA_FILE), "new").unwrap();
        assert!(!copy_old_data(&old_dir, &dir).unwrap());
        assert_eq!(fs::read_to_string(dir.join(DATA_FILE)).unwrap(), "new");
        assert!(old_dir.join(DATA_FILE).exists());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn nothing_is_copied_without_old_data() {
        let root = std::env::temp_dir().join(format!("remme-empty-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        assert!(!copy_old_data(&root.join("old"), &root.join("new")).unwrap());
        assert!(!root.join("new").exists());
    }

    #[test]
    fn timer_lengths_come_from_settings_within_limits() {
        let lengths = timer_lengths(&json!({ "settings": { "pomodoroFocus": 50, "pomodoroShort": 0, "pomodoroLong": "x" } }));
        assert_eq!(lengths, Lengths::from_minutes(50, 5, 15));
    }

    #[test]
    fn colours_become_windows_colorrefs() {
        assert_eq!(colorref("#0e1014"), Some(0x14100e));
        assert_eq!(colorref(" #F2EAD8 "), Some(0xd8eaf2));
        assert_eq!(colorref("#fff"), None);
        assert_eq!(colorref("0e1014"), None);
    }

    fn test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("remme-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn test_state(dir: &Path, backup_folder: Option<String>) -> AppState {
        AppState {
            dir: dir.to_path_buf(),
            data: Mutex::new(json!({})),
            ui: Mutex::new(UiState { backup_folder, ..UiState::default() }),
            shortcuts: Mutex::new(Shortcuts::default()),
            timer: Mutex::new(Timer::default()),
            coach: Mutex::new(CoachRun::default()),
            voice: Mutex::new(VoiceRun { engine: None, status: voice::Status::None, verified: false }),
        }
    }

    #[test]
    fn a_damaged_data_file_is_replaced_by_the_newest_readable_backup() {
        let dir = test_dir("recover");
        let at = |s: &str| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap();
        let backups = dir.join(backup::LOCAL_DIR);
        backup::write(&backups, r#"{"lists":[],"tasks":[{"id":"old"}]}"#, Kind::Daily, at("2026-11-07 08:00")).unwrap();
        backup::write(&backups, r#"{"lists":[],"tasks":[{"id":"new"}]}"#, Kind::Daily, at("2026-11-08 08:00")).unwrap();
        backup::write(&backups, "{ broken", Kind::Manual, at("2026-11-09 08:00")).unwrap();
        fs::write(dir.join(DATA_FILE), "{ also broken").unwrap();

        let mut ui = UiState::default();
        let data = load_or_recover(&dir, &mut ui);
        assert_eq!(data["tasks"][0]["id"], "new");
        let recovery = ui.recovery.unwrap();
        assert_eq!(recovery.restored_from.as_deref(), Some("2026-11-08T08:00:00"));
        assert_eq!(fs::read_to_string(dir.join("reminders.json.corrupt")).unwrap(), "{ also broken");
        assert_eq!(backup::read_data(&dir.join(DATA_FILE)).unwrap()["tasks"][0]["id"], "new");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn wrong_shaped_data_without_backups_starts_empty_and_says_so() {
        let dir = test_dir("no-backups");
        fs::write(dir.join(DATA_FILE), r#"{"hello":"world"}"#).unwrap();
        let mut ui = UiState::default();
        let data = load_or_recover(&dir, &mut ui);
        assert!(backup::is_data(&data));
        assert!(ui.recovery.unwrap().restored_from.is_none());
        assert!(dir.join("reminders.json.corrupt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_data_file_is_a_fresh_start_not_a_recovery() {
        let dir = test_dir("fresh");
        let mut ui = UiState::default();
        let data = load_or_recover(&dir, &mut ui);
        assert!(ui.recovery.is_none());
        // A new install starts with the example reminders.
        assert_eq!(data["lists"][1]["name"], "Getting started");
        assert_eq!(data["tasks"].as_array().unwrap().len(), 5);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn first_run_examples_are_due_today_and_tomorrow_at_nine() {
        let now = Local.with_ymd_and_hms(2026, 11, 17, 15, 30, 0).unwrap();
        let data = first_run_data(now);
        let tasks = data["tasks"].as_array().unwrap();
        assert!(tasks.iter().all(|t| t["listId"] == "getting-started"));
        let due = |i: usize| {
            DateTime::parse_from_rfc3339(tasks[i]["dueAt"].as_str().unwrap()).unwrap().with_timezone(&Local).naive_local()
        };
        assert_eq!(due(0), NaiveDateTime::parse_from_str("2026-11-17 09:00", "%Y-%m-%d %H:%M").unwrap());
        assert_eq!(due(3), NaiveDateTime::parse_from_str("2026-11-18 09:00", "%Y-%m-%d %H:%M").unwrap());
        assert!(tasks[2]["dueAt"].is_null());
        assert_eq!(tasks[2]["flagged"], true);
    }

    #[test]
    fn the_daily_backup_is_taken_once_from_the_file_on_disk() {
        let dir = test_dir("daily-once");
        fs::write(dir.join(DATA_FILE), r#"{"lists":[],"tasks":[]}"#).unwrap();
        let state = test_state(&dir, None);
        ensure_daily_backup(&state);
        ensure_daily_backup(&state);
        let backups = backup::list(&dir.join(backup::LOCAL_DIR));
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].kind, Kind::Daily);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_unreachable_second_folder_is_reported_without_failing_the_backup() {
        let dir = test_dir("second");
        let missing = dir.join("unplugged-drive").display().to_string();
        let state = test_state(&dir, Some(missing.clone()));
        assert!(make_backup(&state, "{}", Kind::Manual).is_ok());
        let error = state.ui.lock().unwrap().backup_folder_error.clone().unwrap();
        assert!(error.starts_with(&format!("Last copy to {missing} failed on ")), "{error}");
        assert!(error.ends_with("folder not found"));

        let second = dir.join("onedrive");
        fs::create_dir_all(&second).unwrap();
        state.ui.lock().unwrap().backup_folder = Some(second.display().to_string());
        make_backup(&state, "{}", Kind::Manual).unwrap();
        assert!(state.ui.lock().unwrap().backup_folder_error.is_none());
        assert_eq!(backup::list(&second.join(backup::SECOND_DIR)).len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_shortcuts_parse() {
        assert!(parse_shortcut(DEFAULT_TOGGLE).is_ok());
        assert!(parse_shortcut(DEFAULT_LOCK).is_ok());
        assert!(parse_shortcut(DEFAULT_POMODORO).is_ok());
        assert!(parse_shortcut("Ctrl+Shift+Nope").is_err());
    }
}
