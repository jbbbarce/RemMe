use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::Duration,
};

use chrono::{DateTime, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

const DATA_FILE: &str = "reminders.json";
const UI_FILE: &str = "ui-state.json";
const DEFAULT_TOGGLE: &str = "Ctrl+Shift+O";
const DEFAULT_LOCK: &str = "Ctrl+Shift+L";
const MAIN: &str = "main";
const FLOAT: &str = "float";

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
}

#[derive(Default)]
struct Shortcuts {
    toggle: Option<(String, Shortcut)>,
    lock: Option<(String, Shortcut)>,
}

struct AppState {
    dir: PathBuf,
    data: Mutex<Value>,
    ui: Mutex<UiState>,
    shortcuts: Mutex<Shortcuts>,
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
            "floatView": "today"
        }
    })
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

fn save_ui(state: &AppState, ui: &UiState) {
    if let Err(error) = write_json(&state.dir.join(UI_FILE), ui) {
        eprintln!("{error}");
    }
}

fn setting(data: &Value, key: &str, fallback: &str) -> String {
    data["settings"][key].as_str().unwrap_or(fallback).to_string()
}

#[derive(Debug, PartialEq)]
struct DueTask {
    /// `taskId|dueAt`, so moving the due time notifies again.
    key: String,
    title: String,
    /// Notify again this many minutes after the last one until the task is done.
    nag_minutes: Option<i64>,
}

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
        if !task["completed"].as_bool().unwrap_or(false) && when <= now {
            let title = task["title"].as_str().unwrap_or("").trim();
            due.push(DueTask {
                key,
                title: if title.is_empty() { "Reminder".into() } else { title.into() },
                nag_minutes: task["nagMinutes"].as_i64().filter(|m| *m > 0),
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
    let mut fired = false;
    for task in due {
        if !should_notify(&task, &ui, now.timestamp()) {
            continue;
        }
        let again = ui.notified.contains(&task.key);
        let heading = if again { "Still to do" } else { "Reminder" };
        let _ = app.notification().builder().title(heading).body(&task.title).show();
        if !again {
            ui.notified.push(task.key.clone());
        }
        if task.nag_minutes.is_some() {
            ui.last_nag.insert(task.key, now.timestamp());
        }
        fired = true;
    }
    if fired || (ui.notified.len(), ui.last_nag.len()) != before {
        save_ui(&state, &ui);
    }
    drop(ui);

    if fired {
        set_float_visible(app, true);
    }
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

/// Returns `(app, title)` for every unfinished task set to remind when one of the `started` apps opens.
fn app_triggered(data: &Value, started: &HashSet<String>) -> Vec<(String, String)> {
    let mut hits = Vec::new();
    for task in data["tasks"].as_array().into_iter().flatten() {
        let Some(app) = task["appTrigger"].as_str().filter(|a| !a.trim().is_empty()) else { continue };
        if task["completed"].as_bool().unwrap_or(false) || !started.contains(&app_key(app)) {
            continue;
        }
        let title = task["title"].as_str().unwrap_or("").trim();
        hits.push((app.trim().to_string(), if title.is_empty() { "Reminder".into() } else { title.into() }));
    }
    hits
}

/// Every few seconds, notifies for reminders tied to an app that has just started.
/// Apps already running when Reminders starts don't count as just started.
fn watch_apps(app: AppHandle) {
    let Ok(mut system) = System::new() else { return };
    let mut before = running_apps_now(&mut system);
    loop {
        thread::sleep(Duration::from_secs(3));
        let now = running_apps_now(&mut system);
        let started: HashSet<String> = now.difference(&before).cloned().collect();
        before = now;
        if started.is_empty() {
            continue;
        }
        let data = app.state::<AppState>().data.lock().unwrap().clone();
        let hits = app_triggered(&data, &started);
        for (name, title) in &hits {
            let _ = app.notification().builder().title(format!("You opened {name}")).body(title).show();
        }
        if !hits.is_empty() {
            set_float_visible(&app, true);
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
fn register_shortcuts(app: &AppHandle, toggle: &str, lock: &str) -> Result<(), String> {
    let toggle_key = parse_shortcut(toggle)?;
    let lock_key = parse_shortcut(lock)?;
    if toggle_key == lock_key {
        return Err("The two shortcuts must be different.".into());
    }

    let state = app.state::<AppState>();
    let mut current = state.shortcuts.lock().unwrap();
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let result = manager
        .register(toggle_key)
        .map_err(|_| format!("{toggle} is already used by another app."))
        .and_then(|_| {
            manager
                .register(lock_key)
                .map_err(|_| format!("{lock} is already used by another app."))
        });

    match result {
        Ok(()) => {
            current.toggle = Some((toggle.to_string(), toggle_key));
            current.lock = Some((lock.to_string(), lock_key));
            Ok(())
        }
        Err(error) => {
            let _ = manager.unregister_all();
            for (_, key) in current.toggle.iter().chain(current.lock.iter()) {
                let _ = manager.register(*key);
            }
            Err(error)
        }
    }
}

#[tauri::command]
fn load_data(state: State<AppState>) -> Value {
    state.data.lock().unwrap().clone()
}

#[tauri::command]
fn save_data(app: AppHandle, window: WebviewWindow, state: State<AppState>, data: Value) -> Result<(), String> {
    write_json(&state.dir.join(DATA_FILE), &data)?;
    *state.data.lock().unwrap() = data.clone();
    app.emit("data-changed", DataChanged { source: window.label().to_string(), data })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_shortcuts(app: AppHandle, toggle: String, lock: String) -> Result<(), String> {
    register_shortcuts(&app, &toggle, &lock)
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
    for (text, key) in current.toggle.iter().chain(current.lock.iter()) {
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

/// Names of running apps, for picking which one a reminder waits for.
#[tauri::command]
fn running_apps() -> Vec<String> {
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

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Reminders", true, None::<&str>)?;
    let float = MenuItem::with_id(app, "float", "Show or hide floating list", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Lock or unlock floating list", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &PredefinedMenuItem::separator(app)?, &float, &lock, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon is bundled"))
        .tooltip("Reminders")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "float" => toggle_float_visible(app),
            "lock" => toggle_float_locked(app),
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
            drop(current);
            if is_toggle {
                toggle_float_visible(app);
            } else if is_lock {
                toggle_float_locked(app);
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
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
        .plugin(shortcut_plugin)
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            set_shortcuts,
            suspend_shortcuts,
            get_float_state,
            set_float,
            show_main,
            running_apps
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
            fs::create_dir_all(&dir)?;
            let data = read_json::<Value>(&dir.join(DATA_FILE))
                .filter(|value| value["lists"].is_array() && value["tasks"].is_array())
                .unwrap_or_else(default_data);
            let ui = read_json::<UiState>(&dir.join(UI_FILE)).unwrap_or_default();
            let toggle = setting(&data, "toggleShortcut", DEFAULT_TOGGLE);
            let lock = setting(&data, "lockShortcut", DEFAULT_LOCK);
            let (float_visible, float_locked) = (ui.float_visible, ui.float_locked);
            app.manage(AppState {
                dir,
                data: Mutex::new(data),
                ui: Mutex::new(ui),
                shortcuts: Mutex::new(Shortcuts::default()),
            });

            let handle = app.handle().clone();
            if let Err(error) = register_shortcuts(&handle, &toggle, &lock) {
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

            let watcher = handle.clone();
            thread::spawn(move || watch_apps(watcher));
            thread::spawn(move || loop {
                check_reminders(&handle);
                thread::sleep(Duration::from_secs(15));
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Reminders");
}

#[cfg(test)]
mod tests {
    use super::*;

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
            vec![DueTask { key: "a|2026-10-27T11:59:00Z".into(), title: "Pay bills".into(), nag_minutes: None }]
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
        assert_eq!(app_triggered(&data, &started), vec![("Teams.exe".to_string(), "Log hours".to_string())]);
    }

    #[test]
    fn default_shortcuts_parse() {
        assert!(parse_shortcut(DEFAULT_TOGGLE).is_ok());
        assert!(parse_shortcut(DEFAULT_LOCK).is_ok());
        assert!(parse_shortcut("Ctrl+Shift+Nope").is_err());
    }
}
