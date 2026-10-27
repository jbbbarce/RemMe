import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ListBadge, LIST_ICON_COMPONENTS } from "../icons";
import { shortcutFromEvent, shortcutParts } from "../shortcut";
import { LIST_COLORS, LIST_ICONS, type AppData, type ReminderList } from "../types";
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
  onShortcuts(toggle: string, lock: string): void;
  onClose(): void;
}

export function SettingsDialog({ data, onShortcuts, onClose }: SettingsProps) {
  const [startup, setStartup] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toggleShortcut, lockShortcut } = data.settings;

  useEffect(() => {
    isEnabled().then(setStartup, () => setStartup(false));
  }, []);

  const apply = async (toggle: string, lock: string) => {
    try {
      await invoke("set_shortcuts", { toggle, lock });
      onShortcuts(toggle, lock);
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
      <h3 className="settings-head">Floating list</h3>
      <div className="group">
        <div className="row">
          <span>Show or hide</span>
          <ShortcutRecorder value={toggleShortcut} onRecord={(s) => apply(s, lockShortcut)} />
        </div>
        <div className="row">
          <span>Lock or unlock</span>
          <ShortcutRecorder value={lockShortcut} onRecord={(s) => apply(toggleShortcut, s)} />
        </div>
      </div>
      <p className="hint">
        These work from any app. Locked, the floating list ignores the mouse so you can click what's behind it;
        press the lock shortcut again to unlock it.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="row-actions">
        <button
          disabled={toggleShortcut === "Ctrl+Shift+O" && lockShortcut === "Ctrl+Shift+L"}
          onClick={() => apply("Ctrl+Shift+O", "Ctrl+Shift+L")}
        >
          Restore defaults
        </button>
      </div>

      <h3 className="settings-head">General</h3>
      <div className="group">
        <label className="row">
          <span>Start with Windows</span>
          {startup !== null && <Switch checked={startup} onChange={setStartupEnabled} />}
        </label>
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
