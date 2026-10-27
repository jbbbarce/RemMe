use std::{collections::HashSet, fs, path::Path, path::PathBuf, sync::Mutex, thread, time::Duration};

use chrono::{DateTime, Utc};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
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

/// Returns `(key, title)` for every unfinished task whose due time has passed,
/// plus the set of keys for all tasks that have a due time.
fn due_tasks(data: &Value, now: DateTime<Utc>) -> (Vec<(String, String)>, HashSet<String>) {
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
            due.push((key, if title.is_empty() { "Reminder".into() } else { title.into() }));
        }
    }
    (due, all_keys)
}

fn check_reminders(app: &AppHandle) {
    let state = app.state::<AppState>();
    let data = state.data.lock().unwrap().clone();
    let (due, all_keys) = due_tasks(&data, Utc::now());

    let mut ui = state.ui.lock().unwrap();
    let before = ui.notified.len();
    ui.notified.retain(|key| all_keys.contains(key));
    let mut fired = false;
    for (key, title) in due {
        if ui.notified.contains(&key) {
            continue;
        }
        let _ = app.notification().builder().title("Reminder").body(&title).show();
        ui.notified.push(key);
        fired = true;
    }
    if fired || ui.notified.len() != before {
        save_ui(&state, &ui);
    }
    drop(ui);

    if fired {
        set_float_visible(app, true);
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
            show_main
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
        assert_eq!(due, vec![("a|2026-10-27T11:59:00Z".to_string(), "Pay bills".to_string())]);
        assert_eq!(keys.len(), 3);
    }

    #[test]
    fn due_time_is_compared_across_time_zones() {
        let data = json!({ "tasks": [
            { "id": "a", "title": "", "dueAt": "2026-10-27T19:30:00+08:00", "completed": false }
        ]});
        let (due, _) = due_tasks(&data, now());
        assert_eq!(due[0].1, "Reminder");
    }

    #[test]
    fn invalid_dates_are_ignored() {
        let data = json!({ "tasks": [ { "id": "a", "title": "x", "dueAt": "tomorrow", "completed": false } ] });
        let (due, keys) = due_tasks(&data, now());
        assert!(due.is_empty() && keys.is_empty());
    }

    #[test]
    fn default_shortcuts_parse() {
        assert!(parse_shortcut(DEFAULT_TOGGLE).is_ok());
        assert!(parse_shortcut(DEFAULT_LOCK).is_ok());
        assert!(parse_shortcut("Ctrl+Shift+Nope").is_err());
    }
}
