import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArchiveRestore, FolderOpen, Trash2, X } from "lucide-react";

type BackupKind = "daily" | "manual" | "beforeRestore" | "beforeImport";

interface BackupInfo {
  name: string;
  kind: BackupKind;
  /** Local time, yyyy-mm-ddThh:mm:ss. */
  takenAt: string;
  reminders: number | null;
  lists: number | null;
}

interface BackupFolder {
  folder: string | null;
  error: string | null;
}

interface ImportFile {
  path: string;
  reminders: number;
  lists: number;
}

interface Recovery {
  restoredFrom: string | null;
  corruptFile: string;
}

const KIND_LABELS: Record<BackupKind, string> = {
  daily: "Automatic",
  manual: "Manual",
  beforeRestore: "Before restore",
  beforeImport: "Before import",
};

/** "Sun 8 Nov 2026, 9:14" in the reader's own date style. A local time without a zone reads as local. */
function formatWhen(localTime: string, withYear = true): string {
  return new Date(localTime).toLocaleString(undefined, {
    weekday: withYear ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function contents(reminders: number | null, lists: number | null): string {
  if (reminders === null || lists === null) return "Can't be read";
  return `${plural(reminders, "reminder")} in ${plural(lists, "list")}`;
}

/** The Backups part of Settings: the list of backups, restore, export and import, and the second folder. */
export function BackupsSection() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [folder, setFolder] = useState<BackupFolder>({ folder: null, error: null });
  /** The backup whose Restore was clicked once and now asks to confirm. */
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportFile | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    invoke<BackupInfo[]>("list_backups").then(setBackups, () => setBackups([]));
    invoke<BackupFolder>("get_backup_folder").then(setFolder, () => {});
  }, []);

  useEffect(refresh, [refresh]);

  /** Runs one action at a time, then shows what happened and reloads the list. */
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const done = await action();
      setMessage(done ? { text: done } : null);
    } catch (e) {
      setMessage({ text: String(e), error: true });
    } finally {
      setBusy(false);
      setConfirmRestore(null);
      refresh();
    }
  };

  return (
    <>
      <h3 className="settings-head">Backups</h3>
      <div className="group">
        <div className="row">
          <span>Back up your reminders</span>
          <span className="row-actions">
            <button disabled={busy} onClick={() => run(() => invoke("backup_now").then(() => "Backed up."))}>
              Back up now
            </button>
            <button className="icon-btn" title="Open backup folder" onClick={() => run(() => invoke("open_backup_folder").then(() => null))}>
              <FolderOpen size={15} />
            </button>
          </span>
        </div>
        <div className="row">
          <span>Move to another PC</span>
          <span className="row-actions">
            <button
              disabled={busy}
              onClick={() => run(() => invoke<boolean>("export_data").then((saved) => (saved ? "Exported." : null)))}
            >
              Export…
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setPendingImport(await invoke<ImportFile | null>("pick_import_file"));
                  return null;
                })
              }
            >
              Import…
            </button>
          </span>
        </div>
        {pendingImport && (
          <div className="row backup-confirm">
            <span>
              Replace all your reminders, lists and settings with {contents(pendingImport.reminders, pendingImport.lists)}{" "}
              from this file? Your current data is backed up first.
            </span>
            <span className="row-actions">
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  const path = pendingImport.path;
                  setPendingImport(null);
                  run(() => invoke("import_data", { path }).then(() => "Imported."));
                }}
              >
                Replace
              </button>
              <button onClick={() => setPendingImport(null)}>Cancel</button>
            </span>
          </div>
        )}
        <div className="row">
          <span className="backup-folder">
            Also back up to
            <small>{folder.folder ?? "Off"}</small>
          </span>
          <span className="row-actions">
            <button
              disabled={busy}
              onClick={() => run(() => invoke<BackupFolder>("choose_backup_folder").then((f) => (setFolder(f), null)))}
            >
              {folder.folder ? "Change…" : "Choose…"}
            </button>
            {folder.folder && (
              <button disabled={busy} onClick={() => run(() => invoke<BackupFolder>("clear_backup_folder").then((f) => (setFolder(f), null)))}>
                Stop
              </button>
            )}
          </span>
        </div>
      </div>
      {folder.error && <p className="hint error-text">{folder.error}</p>}
      {message && <p className={`hint${message.error ? " error-text" : ""}`}>{message.text}</p>}

      <div className="group backup-list">
        {backups.length === 0 && <p className="hint">No backups yet. The first one is made tomorrow, or press Back up now.</p>}
        {backups.map((b) => (
          <div className="row" key={b.name}>
            <span className="backup-when">
              {formatWhen(b.takenAt)}
              <small>
                {contents(b.reminders, b.lists)} · {KIND_LABELS[b.kind]}
              </small>
            </span>
            <span className="row-actions">
              {b.reminders !== null && (
                <button
                  className={confirmRestore === b.name ? "danger" : undefined}
                  disabled={busy}
                  onClick={() =>
                    confirmRestore === b.name
                      ? run(() => invoke("restore_backup", { name: b.name }).then(() => `Restored the backup from ${formatWhen(b.takenAt, false)}.`))
                      : setConfirmRestore(b.name)
                  }
                  onBlur={() => setConfirmRestore((current) => (current === b.name ? null : current))}
                >
                  {confirmRestore === b.name ? "Replace current data?" : "Restore"}
                </button>
              )}
              {b.kind === "manual" && (
                <button
                  className="icon-btn"
                  title="Delete this backup"
                  disabled={busy}
                  onClick={() => run(() => invoke("delete_backup", { name: b.name }).then(() => null))}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="hint">
        RemMe keeps a backup from each of the last 7 days and one from each of the 4 weeks before. Restoring or
        importing backs up your current data first, so it can be undone.
      </p>
    </>
  );
}

/** A banner in the main window after RemMe replaced a damaged data file at startup. */
export function RecoveryBanner() {
  const [recovery, setRecovery] = useState<Recovery | null>(null);

  useEffect(() => {
    invoke<Recovery | null>("get_recovery").then(setRecovery, () => {});
  }, []);

  if (!recovery) return null;
  const dismiss = () => {
    setRecovery(null);
    invoke("dismiss_recovery");
  };
  return (
    <div className="recovery-bar" role="alert">
      <ArchiveRestore size={15} />
      <span>
        {recovery.restoredFrom
          ? `Your reminders file was damaged. RemMe restored the backup from ${formatWhen(recovery.restoredFrom, false)}.`
          : `Your reminders file was damaged and there was no backup to restore, so RemMe started empty. The damaged file is kept at ${recovery.corruptFile}.`}
      </span>
      <button onClick={() => invoke("open_backup_folder")}>Open backup folder</button>
      <button className="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
