import { Download, X } from "lucide-react";
import type { useUpdates } from "../updates";

/** A bar at the bottom of the main window when a new version is ready. */
export function UpdateBar({ updates }: { updates: ReturnType<typeof useUpdates> }) {
  const { status } = updates;
  if (status.kind === "available") {
    return (
      <div className="update-bar" role="status">
        <Download size={15} />
        <span>RemMe {status.update.version} is ready.</span>
        <button className="update-go" onClick={updates.install}>
          Update and restart
        </button>
        <button className="icon-btn" aria-label="Later" title="Later" onClick={updates.dismiss}>
          <X size={14} />
        </button>
      </div>
    );
  }
  if (status.kind === "installing") {
    return (
      <div className="update-bar" role="status">
        <Download size={15} />
        <span>Updating{status.percent !== null ? `, ${status.percent}%` : ""}… RemMe restarts by itself.</span>
      </div>
    );
  }
  return null;
}
