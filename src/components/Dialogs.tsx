import { BackupsSection } from "./Backups";
import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  Alert,
  BookOpen,
  Checkmark,
  FloatingList,
  History,
  Info,
  Keyboard,
  ListBadge,
  LIST_ICON_COMPONENTS,
  PaintBrush,
  Settings as SettingsIcon,
  Timer,
} from "../icons";
import { shortcutFromEvent, shortcutParts } from "../shortcut";
import { THEME_NAMES } from "../theme";
import type { useUpdates } from "../updates";
import { DEFAULT_SETTINGS, validMinutes } from "../model";
import { DENSITIES, LIST_COLORS, LIST_ICONS, THEMES, type AppData, type ReminderList, type Settings, type ThemeId } from "../types";
import { Switch } from "./Inspector";
import { Modal } from "./ui";

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
    <Modal title={isNew ? "New list" : "Edit list"} className="list-modal" onClose={onClose}>
      <div className="list-preview">
        <ListBadge icon={draft.icon} color={draft.color} size={64} />
      </div>
      <label className="list-field">
        <span className="settings-label">Name</span>
        <input
          className="field name-field"
          autoFocus
          value={draft.name}
          placeholder="List name"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </label>
      <div className="list-field">
        <span className="settings-label" id="list-colour">Colour</span>
        <div className="swatches" role="radiogroup" aria-labelledby="list-colour">
          {LIST_COLORS.map((color) => (
            <button
              key={color}
              role="radio"
              aria-checked={draft.color === color}
              className={`swatch${draft.color === color ? " on" : ""}`}
              style={{ background: `var(--c-${color})` }}
              aria-label={nameOf(color)}
              title={nameOf(color)}
              onClick={() => setDraft({ ...draft, color })}
            >
              {draft.color === color && <Checkmark size={14} />}
            </button>
          ))}
        </div>
      </div>
      <div className="list-field">
        <span className="settings-label" id="list-icon">Icon</span>
        <div className="icon-grid" role="radiogroup" aria-labelledby="list-icon">
          {LIST_ICONS.map((icon) => {
            const Icon = LIST_ICON_COMPONENTS[icon];
            return (
              <button
                key={icon}
                role="radio"
                aria-checked={draft.icon === icon}
                className={`icon-choice${draft.icon === icon ? " on" : ""}`}
                aria-label={nameOf(icon)}
                title={nameOf(icon)}
                onClick={() => setDraft({ ...draft, icon })}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="modal-actions">
        {!isNew && canDelete && (
          <button
            className="danger"
            onClick={() => (confirming || taskCount === 0 ? onDelete() : setConfirming(true))}
          >
            {confirming ? `Delete list and ${taskCount} ${taskCount === 1 ? "reminder" : "reminders"}?` : "Delete List"}
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

/** "gray" → "Gray": the readable name of a colour or icon. */
function nameOf(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

interface SettingsProps {
  data: AppData;
  onShortcuts(toggle: string, lock: string, pomodoro: string): void;
  onTheme(theme: ThemeId): void;
  onSettings(patch: Partial<Settings>): void;
  updates: ReturnType<typeof useUpdates>;
  onClose(): void;
}

const SECTIONS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: PaintBrush },
  { id: "floating", label: "Floating list", icon: FloatingList },
  { id: "notifications", label: "Notifications", icon: Alert },
  { id: "timer", label: "Focus timer", icon: Timer },
  { id: "verse", label: "Verse of the day", icon: BookOpen },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "backups", label: "Backups", icon: History },
  { id: "about", label: "About", icon: Info },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const SECTION_KEY = "remme.settings";

function readSection(): SectionId {
  try {
    const saved = localStorage.getItem(SECTION_KEY);
    return SECTIONS.find((s) => s.id === saved)?.id ?? "general";
  } catch {
    return "general";
  }
}

/** The keys inside the main window, listed read-only in Shortcuts. */
const APP_KEYS: [string, string][] = [
  ["Ctrl+N", "New reminder"],
  ["Enter", "In a title: add the next reminder"],
  ["Esc", "In a title: back to the row"],
  ["Up / Down", "Select the previous or next reminder"],
  ["Shift+Up / Shift+Down", "Extend the selection"],
  ["Ctrl+A", "Select all"],
  ["Enter or F2", "Edit the selected title"],
  ["Space", "Tick the selected reminders off"],
  ["Delete", "Delete the selected reminders"],
  ["Ctrl+I", "Open details"],
  ["Ctrl+Z", "Undo, while the toast shows"],
  ["Esc", "Clear the selection, or close details"],
];

/** Settings: a list of sections on the left and one section's settings on the right. */
export function SettingsDialog({ data, onShortcuts, onTheme, onSettings, updates, onClose }: SettingsProps) {
  const [section, setSection] = useState<SectionId>(readSection);
  const [startup, setStartup] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toggleShortcut, lockShortcut, pomodoroShortcut } = data.settings;
  const current = SECTIONS.find((s) => s.id === section)!;

  useEffect(() => {
    isEnabled().then(setStartup, () => setStartup(false));
  }, []);

  const go = (id: SectionId, focus = false) => {
    setSection(id);
    try {
      localStorage.setItem(SECTION_KEY, id);
    } catch {
      // Remembering the section is a convenience only.
    }
    if (focus) window.setTimeout(() => document.getElementById(`settings-tab-${id}`)?.focus(), 0);
  };

  const onNavKey = (e: React.KeyboardEvent) => {
    const i = SECTIONS.findIndex((s) => s.id === section);
    const to =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (i + 1) % SECTIONS.length
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (i - 1 + SECTIONS.length) % SECTIONS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? SECTIONS.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    go(SECTIONS[to].id, true);
  };

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

  const toShortcuts = (
    <p className="hint">
      <button className="link-btn inline" onClick={() => go("shortcuts")}>
        Change its keyboard shortcuts in Shortcuts
      </button>
    </p>
  );

  return (
    <Modal title="Settings" className="settings-modal" onClose={onClose}>
      <div className="settings-body">
        <nav className="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical" onKeyDown={onNavKey}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              id={`settings-tab-${s.id}`}
              role="tab"
              aria-selected={s.id === section}
              aria-controls="settings-pane"
              tabIndex={s.id === section ? 0 : -1}
              className={s.id === section ? "on" : ""}
              onClick={() => go(s.id)}
            >
              <s.icon size={18} />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-pane" id="settings-pane" role="tabpanel" aria-labelledby={`settings-tab-${section}`}>
          <h3 className="settings-pane-title">{current.label}</h3>

          {section === "general" && (
            <Setting label="Start with Windows" hint="RemMe starts hidden in the tray when you sign in.">
              {startup !== null && <Switch checked={startup} onChange={setStartupEnabled} />}
            </Setting>
          )}

          {section === "appearance" && (
            <>
              <div className="settings-block">
                <span className="settings-label">Theme</span>
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
              </div>
              <Setting label="Row spacing" hint="The floating list is always compact.">
                <div className="segmented" role="group" aria-label="Row spacing">
                  {DENSITIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={data.settings.density === d ? "on" : ""}
                      aria-pressed={data.settings.density === d}
                      onClick={() => onSettings({ density: d })}
                    >
                      {d === "compact" ? "Compact" : "Comfortable"}
                    </button>
                  ))}
                </div>
              </Setting>
            </>
          )}

          {section === "floating" && (
            <>
              <Setting label="Opacity" hint="Locked, it is a little fainter still, and clicks go through it.">
                <span className="range-row">
                  <input
                    type="range"
                    min={40}
                    max={100}
                    step={5}
                    value={data.settings.floatOpacity}
                    aria-label="Opacity"
                    aria-valuetext={`${data.settings.floatOpacity}%`}
                    onChange={(e) => onSettings({ floatOpacity: Number(e.target.value) })}
                  />
                  <output>{data.settings.floatOpacity}%</output>
                </span>
              </Setting>
              {toShortcuts}
            </>
          )}

          {section === "notifications" && (
            <Setting
              label="Keep reminder popups on screen until I respond"
              hint="Windows only passes on Snooze and Done while the popup shows."
            >
              <Switch checked={data.settings.stickyReminders} onChange={(stickyReminders) => onSettings({ stickyReminders })} />
            </Setting>
          )}

          {section === "timer" && (
            <>
              <MinutesField label="Focus" value={data.settings.pomodoroFocus} onChange={(pomodoroFocus) => onSettings({ pomodoroFocus })} />
              <MinutesField label="Short break" value={data.settings.pomodoroShort} onChange={(pomodoroShort) => onSettings({ pomodoroShort })} />
              <MinutesField
                label="Long break"
                hint="Comes after every fourth focus session."
                value={data.settings.pomodoroLong}
                onChange={(pomodoroLong) => onSettings({ pomodoroLong })}
              />
              <Setting label="Chime when a session ends">
                <Switch checked={data.settings.pomodoroChime} onChange={(pomodoroChime) => onSettings({ pomodoroChime })} />
              </Setting>
              <p className="hint">New lengths apply from the next session.</p>
              {toShortcuts}
            </>
          )}

          {section === "verse" && (
            <Setting label="Show the verse of the day" hint="From the World English Bible, in the sidebar and the floating list.">
              <Switch checked={data.settings.verseOfDay} onChange={(verseOfDay) => onSettings({ verseOfDay })} />
            </Setting>
          )}

          {section === "shortcuts" && (
            <>
              <p className="hint">These work from any app. Click a shortcut, then press the new keys.</p>
              <Setting label="Show or hide the floating list">
                <ShortcutRecorder value={toggleShortcut} onRecord={(s) => apply(s, lockShortcut, pomodoroShortcut)} />
              </Setting>
              <Setting label="Lock or unlock the floating list">
                <ShortcutRecorder value={lockShortcut} onRecord={(s) => apply(toggleShortcut, s, pomodoroShortcut)} />
              </Setting>
              <Setting label="Start or pause the focus timer">
                <ShortcutRecorder value={pomodoroShortcut} onRecord={(s) => apply(toggleShortcut, lockShortcut, s)} />
              </Setting>
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
                  Restore defaults
                </button>
              </div>
              <div className="settings-block">
                <span className="settings-label">In the main window</span>
                <dl className="key-list">
                  {APP_KEYS.map(([keys, what]) => (
                    <div key={keys + what}>
                      <dt>
                        {keys.split(" / ").map((combo, i) => (
                          <span key={combo}>
                            {i > 0 && " / "}
                            {shortcutParts(combo).map((part) => (
                              <kbd key={part}>{part}</kbd>
                            ))}
                          </span>
                        ))}
                      </dt>
                      <dd>{what}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          )}

          {section === "backups" && <BackupsSection />}

          {section === "about" && (
            <>
              <Setting label={`RemMe ${updates.version}`} hint="RemMe also checks for updates by itself every 6 hours.">
                <span className="row-actions">
                  <button disabled={updates.status.kind === "checking"} onClick={updates.check}>
                    Check for updates
                  </button>
                </span>
              </Setting>
              {updates.status.kind === "checking" && <p className="hint">Checking…</p>}
              {updates.status.kind === "none" && <p className="hint">You have the latest version.</p>}
              {updates.status.kind === "available" && (
                <p className="hint">Version {updates.status.update.version} is ready. Use the bar at the bottom of the window to install it.</p>
              )}
              {updates.status.kind === "error" && <p className="error">Couldn't check for updates: {updates.status.message}</p>}
              <p className="hint">Free and open source under the MIT license. Verses from the World English Bible (public domain).</p>
            </>
          )}
        </div>
      </div>

      <div className="modal-actions">
        <span className="spacer" />
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/** One setting: its label and control on a row, and an optional short line explaining it. */
function Setting({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="setting">
      <div className="row">
        <span>{label}</span>
        {children}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function MinutesField({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange(minutes: number): void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const minutes = validMinutes(Number(draft), value);
    setDraft(String(minutes));
    if (minutes !== value) onChange(minutes);
  };
  return (
    <Setting label={label} hint={hint}>
      <span className="minutes">
        <input
          className="field"
          type="number"
          min={1}
          max={180}
          aria-label={`${label} minutes`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        min
      </span>
    </Setting>
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
      <button
        className={`keys${recording ? " recording" : ""}`}
        title="Click, then press keys"
        aria-label={recording ? "Recording: press the new keys, or Esc to cancel" : `${value}. Click, then press new keys`}
        onClick={() => setRecording(!recording)}
      >
        <Keyboard size={16} className="keys-icon" />
        {recording ? (
          <span className="recording-text">{message ?? "Press keys… (Esc to cancel)"}</span>
        ) : (
          shortcutParts(value).map((part) => <kbd key={part}>{part}</kbd>)
        )}
      </button>
    </div>
  );
}
