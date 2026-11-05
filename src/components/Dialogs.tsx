import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ListBadge, LIST_ICON_COMPONENTS } from "../icons";
import { shortcutFromEvent, shortcutParts } from "../shortcut";
import { THEME_NAMES } from "../theme";
import type { useUpdates } from "../updates";
import { DEFAULT_SETTINGS, validMinutes } from "../model";
import { LIST_COLORS, LIST_ICONS, THEMES, type AppData, type ReminderList, type Settings, type ThemeId } from "../types";
import { Switch } from "./Inspector";

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

interface ListDialogProps {
  list: ReminderList;
  isNew: boolean;
  canDelete: boolean;
  taskCount: number;
  onSave(list: ReminderList): void;
  onDelete(): void;
  onClose(): void;
}

export function ListDialog({ list, isNew, canDelete, taskCount, onSave, onDelete, onClose }: ListDialogProps) {
  const [draft, setDraft] = useState(list);
  const [confirming, setConfirming] = useState(false);
  const save = () => draft.name.trim() && onSave({ ...draft, name: draft.name.trim() });

  return (
    <Modal title={isNew ? "New List" : "List Info"} onClose={onClose}>
      <div className="list-preview">
        <ListBadge icon={draft.icon} color={draft.color} size={64} />
      </div>
      <input
        className="field name-field"
        autoFocus
        value={draft.name}
        placeholder="List Name"
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <div className="swatches">
        {LIST_COLORS.map((color) => (
          <button
            key={color}
            className={`swatch${draft.color === color ? " on" : ""}`}
            style={{ background: `var(--c-${color})` }}
            aria-label={color}
            onClick={() => setDraft({ ...draft, color })}
          />
        ))}
      </div>
      <div className="icon-grid">
        {LIST_ICONS.map((icon) => {
          const Icon = LIST_ICON_COMPONENTS[icon];
          return (
            <button
              key={icon}
              className={`icon-choice${draft.icon === icon ? " on" : ""}`}
              aria-label={icon}
              onClick={() => setDraft({ ...draft, icon })}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>
      <div className="modal-actions">
        {!isNew && canDelete && (
          <button
            className="danger"
            onClick={() => (confirming || taskCount === 0 ? onDelete() : setConfirming(true))}
          >
            {confirming ? `Delete list and ${taskCount} reminders?` : "Delete List"}
          </button>
        )}
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!draft.name.trim()} onClick={save}>
          {isNew ? "Create" : "Done"}
        </button>
      </div>
    </Modal>
  );
}

interface SettingsProps {
  data: AppData;
  onShortcuts(toggle: string, lock: string, pomodoro: string): void;
  onTheme(theme: ThemeId): void;
  onSettings(patch: Partial<Settings>): void;
  updates: ReturnType<typeof useUpdates>;
  onClose(): void;
}

export function SettingsDialog({ data, onShortcuts, onTheme, onSettings, updates, onClose }: SettingsProps) {
  const [startup, setStartup] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toggleShortcut, lockShortcut, pomodoroShortcut } = data.settings;

  useEffect(() => {
    isEnabled().then(setStartup, () => setStartup(false));
  }, []);

  const apply = async (toggle: string, lock: string, pomodoro: string) => {
    try {
      await invoke("set_shortcuts", { toggle, lock, pomodoro });
      onShortcuts(toggle, lock, pomodoro);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const setStartupEnabled = async (on: boolean) => {
    try {
      await (on ? enable() : disable());
      setStartup(await isEnabled());
    } catch (e) {
      setError(`Could not change Start with Windows: ${e}`);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <h3 className="settings-head">Theme</h3>
      <div className="themes">
        {THEMES.map((theme) => (
          <button
            key={theme}
            className={`theme-choice${data.settings.theme === theme ? " on" : ""}`}
            aria-pressed={data.settings.theme === theme}
            onClick={() => onTheme(theme)}
          >
            <span className="theme-preview" data-theme={theme} aria-hidden="true">
              <span className="tp-side">
                <i />
                <i />
                <i />
              </span>
              <span className="tp-main">
                <span className="tp-title">Today</span>
                <span className="tp-row">
                  <b />
                  <i />
                </span>
                <span className="tp-row">
                  <b />
                  <i />
                </span>
              </span>
            </span>
            <span className="theme-name">{THEME_NAMES[theme]}</span>
          </button>
        ))}
      </div>

      <h3 className="settings-head">Floating list</h3>
      <div className="group">
        <div className="row">
          <span>Show or hide</span>
          <ShortcutRecorder value={toggleShortcut} onRecord={(s) => apply(s, lockShortcut, pomodoroShortcut)} />
        </div>
        <div className="row">
          <span>Lock or unlock</span>
          <ShortcutRecorder value={lockShortcut} onRecord={(s) => apply(toggleShortcut, s, pomodoroShortcut)} />
        </div>
      </div>
      <p className="hint">
        These work from any app. Locked, the floating list ignores the mouse so you can click what's behind it;
        press the lock shortcut again to unlock it.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="row-actions">
        <button
          disabled={
            toggleShortcut === DEFAULT_SETTINGS.toggleShortcut &&
            lockShortcut === DEFAULT_SETTINGS.lockShortcut &&
            pomodoroShortcut === DEFAULT_SETTINGS.pomodoroShortcut
          }
          onClick={() =>
            apply(DEFAULT_SETTINGS.toggleShortcut, DEFAULT_SETTINGS.lockShortcut, DEFAULT_SETTINGS.pomodoroShortcut)
          }
        >
          Restore default shortcuts
        </button>
      </div>

      <h3 className="settings-head">Pomodoro</h3>
      <div className="group">
        <MinutesField label="Focus" value={data.settings.pomodoroFocus} onChange={(pomodoroFocus) => onSettings({ pomodoroFocus })} />
        <MinutesField label="Short break" value={data.settings.pomodoroShort} onChange={(pomodoroShort) => onSettings({ pomodoroShort })} />
        <MinutesField label="Long break" value={data.settings.pomodoroLong} onChange={(pomodoroLong) => onSettings({ pomodoroLong })} />
        <label className="row">
          <span>Chime when a session ends</span>
          <Switch checked={data.settings.pomodoroChime} onChange={(pomodoroChime) => onSettings({ pomodoroChime })} />
        </label>
        <div className="row">
          <span>Start or pause</span>
          <ShortcutRecorder value={pomodoroShortcut} onRecord={(s) => apply(toggleShortcut, lockShortcut, s)} />
        </div>
      </div>
      <p className="hint">The long break comes after every fourth focus session. New lengths apply from the next session.</p>

      <h3 className="settings-head">General</h3>
      <div className="group">
        <label className="row">
          <span>Start with Windows</span>
          {startup !== null && <Switch checked={startup} onChange={setStartupEnabled} />}
        </label>
        <div className="row">
          <span>RemMe {updates.version}</span>
          <span className="row-actions">
            <button disabled={updates.status.kind === "checking"} onClick={updates.check}>
              Check for updates
            </button>
          </span>
        </div>
      </div>
      {updates.status.kind === "checking" && <p className="hint">Checking…</p>}
      {updates.status.kind === "none" && <p className="hint">You have the latest version.</p>}
      {updates.status.kind === "available" && (
        <p className="hint">Version {updates.status.update.version} is ready. Use the bar at the bottom of the window to install it.</p>
      )}
      {updates.status.kind === "error" && <p className="error">Couldn't check for updates: {updates.status.message}</p>}

      <div className="modal-actions">
        <span className="spacer" />
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function MinutesField({ label, value, onChange }: { label: string; value: number; onChange(minutes: number): void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const minutes = validMinutes(Number(draft), value);
    setDraft(String(minutes));
    if (minutes !== value) onChange(minutes);
  };
  return (
    <label className="row">
      <span>{label}</span>
      <span className="minutes">
        <input
          className="field"
          type="number"
          min={1}
          max={180}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        min
      </span>
    </label>
  );
}

function ShortcutRecorder({ value, onRecord }: { value: string; onRecord(shortcut: string): void }) {
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    // Pause the global hotkeys so the current combination reaches this page.
    invoke("suspend_shortcuts", { suspended: true });
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const result = shortcutFromEvent(e);
      if (!result) return;
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      setRecording(false);
      onRecord(result.shortcut);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      invoke("suspend_shortcuts", { suspended: false });
      setMessage(null);
    };
  }, [recording, onRecord]);

  return (
    <div className="recorder">
      <button className={`keys${recording ? " recording" : ""}`} onClick={() => setRecording(!recording)}>
        {recording ? (
          <span className="recording-text">{message ?? "Press keys… (Esc to cancel)"}</span>
        ) : (
          shortcutParts(value).map((part) => <kbd key={part}>{part}</kbd>)
        )}
      </button>
    </div>
  );
}
