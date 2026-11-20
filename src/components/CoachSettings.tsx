import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Add, Dismiss } from "../icons";
import { DEFAULT_DISTRACTIONS, FOCUS_PRESETS, MAX_RANGES_PER_DAY, VOICE_OPTIONS, WEEKDAY_NAMES, coachFrom } from "../coach";
import { VOICE_DOWNLOAD_MB, megabytes, speak, useVoiceStatus } from "../voice";
import { Dropdown } from "./ui";
import type { CoachSettings, Distraction } from "../types";
import { Switch } from "./Inspector";
import { useCoachState } from "./CoachStatus";

/** Monday first on screen; the data keeps Sunday first, like `Date.getDay()`. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
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

/** A whole number of minutes; typed values are checked when you leave the box. */
function Minutes({ label, hint, value, max = 120, onChange }: { label: string; hint?: string; value: number; max?: number; onChange(v: number): void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && n >= 1 && n <= max) onChange(n);
    else setDraft(String(value));
  };
  return (
    <Row label={label} hint={hint}>
      <span className="minutes">
        <input
          className="field"
          type="number"
          min={1}
          max={max}
          aria-label={`${label}, minutes`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        min
      </span>
    </Row>
  );
}

/** Settings → Coach. */
export function CoachSettingsSection({ coach, onChange }: { coach: CoachSettings; onChange(coach: CoachSettings): void }) {
  // Locked while a Takeover is up, so it can't be talked out of in the moment.
  const locked = useCoachState().takeoverUp;
  const set = (patch: Partial<CoachSettings>) => {
    if (!locked) onChange(coachFrom({ ...coach, ...patch }));
  };

  return (
    <fieldset className="coach-settings" disabled={locked}>
      {locked && (
        <p className="coach-locked" role="status">
          Locked while a Takeover is up. Choose Start focus, a snooze or a break first.
        </p>
      )}
      <Row label="Turn on Coach">
        <Switch checked={coach.enabled} onChange={(enabled) => set({ enabled })} />
      </Row>
      <div className="coach-notice">
        <p>
          During your focus time, Coach notices when you're on a distraction or idle and points you back to what's due,
          getting firmer the longer it goes on.
        </p>
        <p>
          It reads only the front window's app and title, and how long since you last used the mouse or keyboard. It
          never takes screenshots, never stores what it reads, sends nothing anywhere and never closes your apps. Pause
          it from the tray.
        </p>
      </div>

      <FocusHours coach={coach} set={set} />

      <Row label="Also when something is overdue" hint="Coach watches whenever a reminder is overdue, even outside your focus hours.">
        <Switch checked={coach.alsoWhenOverdue} onChange={(alsoWhenOverdue) => set({ alsoWhenOverdue })} />
      </Row>

      <Distractions coach={coach} set={set} />

      <div className="settings-block">
        <span className="settings-label">Timing</span>
        <Minutes label="Idle after" hint="No mouse or keyboard for this long counts as idle." value={coach.idleMinutes} onChange={(idleMinutes) => set({ idleMinutes })} />
        <Minutes label="Nudge after" hint="Off track this long without a stop." value={coach.nudgeAfter} onChange={(nudgeAfter) => set({ nudgeAfter })} />
        <Minutes label="Push after" hint="A firmer popup with a sound, which stays until you answer." value={coach.pushAfter} onChange={(pushAfter) => set({ pushAfter })} />
        <Row
          label="Takeover"
          hint="Dims the screen you're on until you choose: start focus, snooze 5 minutes (2 an hour) or take a 15-minute break (3 per focus time)."
        >
          <Switch checked={coach.takeover} onChange={(takeover) => set({ takeover })} />
        </Row>
        {coach.takeover && (
          <Minutes
            label="Takeover after"
            hint="Off track this long without a stop. Always after the Push."
            value={coach.takeoverAfter}
            max={240}
            onChange={(takeoverAfter) => set({ takeoverAfter })}
          />
        )}
      </div>

      <div className="settings-block">
        <span className="settings-label">Real talk</span>
        <Row label="Use real talk" hint="Coach gets blunt once you've been off track for a long time in total.">
          <Switch checked={coach.realTalk} onChange={(realTalk) => set({ realTalk })} />
        </Row>
        <Minutes
          label="After, in total"
          hint="Counted across one focus block. Breaks don't count."
          value={coach.realTalkAfter}
          max={240}
          onChange={(realTalkAfter) => set({ realTalkAfter })}
        />
        <RealTalkLines lines={coach.realTalkLines} onChange={(realTalkLines) => set({ realTalkLines })} />
      </div>

      <VoiceSettings coach={coach} set={set} />
    </fieldset>
  );
}

const voiceOptions = VOICE_OPTIONS.map((v) => ({ value: v.id, label: `${v.name} (${v.note})` }));

/** Speak, the voice choices and the download. */
function VoiceSettings({ coach, set }: { coach: CoachSettings; set(patch: Partial<CoachSettings>): void }) {
  const status = useVoiceStatus();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // A failed download turns Speak back off.
  useEffect(() => {
    if (status.state === "error" && coach.speak) set({ speak: false });
  }, [status.state]);

  const turnOn = (on: boolean) => {
    set({ speak: on });
    if (on && status.state !== "ready") invoke("voice_download").catch(() => {});
  };

  return (
    <div className="settings-block">
      <span className="settings-label">Voice</span>
      <Row label="Speak" hint="Coach reads the Push and real talk aloud in a natural voice. It runs on this PC; nothing is sent anywhere.">
        <Switch checked={coach.speak} onChange={turnOn} />
      </Row>
      {status.state === "none" && (
        <p className="hint">Turning on Speak downloads the voice once, about {VOICE_DOWNLOAD_MB} MB.</p>
      )}
      {status.state === "downloading" && (
        <div className="voice-progress" role="status">
          <progress max={status.total} value={status.done} />
          <span className="hint">
            Downloading the voice… {megabytes(status.done)} of {megabytes(status.total)}
          </span>
        </div>
      )}
      {status.state === "error" && (
        <div className="voice-progress" role="alert">
          <p className="hint error-text">{status.message}</p>
          <div className="row-actions">
            <button onClick={() => turnOn(true)}>Try again</button>
          </div>
        </div>
      )}
      <Row label="Voice">
        <Dropdown label="Voice" value={coach.voice} options={voiceOptions} onChange={(voice) => set({ voice })} />
      </Row>
      <Row label="Real talk voice">
        <Dropdown
          label="Real talk voice"
          value={coach.realTalkVoice ?? ""}
          options={[{ value: "", label: "Same as above" }, ...voiceOptions]}
          onChange={(v) => set({ realTalkVoice: v || null })}
        />
      </Row>
      <Row label="Speed">
        <span className="range-row">
          <input
            type="range"
            min={0.8}
            max={1.3}
            step={0.05}
            value={coach.voiceSpeed}
            aria-label="Speed"
            onChange={(e) => set({ voiceSpeed: Number(e.target.value) })}
          />
          <output>{coach.voiceSpeed.toFixed(2)}×</output>
        </span>
      </Row>
      <Row label="Volume">
        <span className="range-row">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={coach.voiceVolume}
            aria-label="Volume"
            onChange={(e) => set({ voiceVolume: Number(e.target.value) })}
          />
          <output>{coach.voiceVolume}%</output>
        </span>
      </Row>
      {status.state === "ready" && (
        <div className="row-actions">
          <button onClick={() => speak("This is Coach. Your lab report is waiting. Back to it.", coach.voice, coach.voiceSpeed, coach.voiceVolume)}>
            Test
          </button>
          {coach.realTalkVoice && (
            <button onClick={() => speak("You said this mattered. Act like it.", coach.realTalkVoice!, coach.voiceSpeed, coach.voiceVolume)}>
              Test real talk
            </button>
          )}
          <button
            className={confirmRemove ? "danger" : undefined}
            onBlur={() => setConfirmRemove(false)}
            onClick={() => {
              if (!confirmRemove) return setConfirmRemove(true);
              setConfirmRemove(false);
              set({ speak: false });
              invoke("voice_remove").then(() => setRemoveError(null), (e) => setRemoveError(String(e)));
            }}
          >
            {confirmRemove ? `Remove ${VOICE_DOWNLOAD_MB} MB?` : "Remove voice"}
          </button>
        </div>
      )}
      {removeError && <p className="hint error-text">{removeError}</p>}
    </div>
  );
}

function FocusHours({ coach, set }: { coach: CoachSettings; set(patch: Partial<CoachSettings>): void }) {
  const setDay = (day: number, ranges: CoachSettings["focusHours"][number]) =>
    set({ focusHours: coach.focusHours.map((r, d) => (d === day ? ranges : r)) });
  return (
    <div className="settings-block">
      <span className="settings-label">Focus hours</span>
      <p className="hint">The times you mean to work. Starting the focus timer also turns Coach on, at any time.</p>
      <div className="row-actions">
        {FOCUS_PRESETS.map((p) => (
          <button key={p.label} onClick={() => set({ focusHours: p.hours })}>
            {p.label}
          </button>
        ))}
        <button onClick={() => set({ focusHours: [[], [], [], [], [], [], []] })}>Clear all</button>
      </div>
      <div className="focus-days">
        {DAY_ORDER.map((day) => {
          const ranges = coach.focusHours[day];
          return (
            <div className="focus-day" key={day}>
              <span className="focus-day-name">{WEEKDAY_NAMES[day].slice(0, 3)}</span>
              <div className="focus-ranges">
                {ranges.length === 0 && <span className="hint">Off</span>}
                {ranges.map((r, i) => (
                  <span className="focus-range" key={i}>
                    <input
                      type="time"
                      className="field"
                      aria-label={`${WEEKDAY_NAMES[day]} range ${i + 1} start`}
                      value={r.start}
                      onChange={(e) => e.target.value && setDay(day, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                    />
                    –
                    <input
                      type="time"
                      className="field"
                      aria-label={`${WEEKDAY_NAMES[day]} range ${i + 1} end`}
                      value={r.end}
                      onChange={(e) => e.target.value && setDay(day, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                    />
                    <button className="icon-btn" aria-label={`Remove ${WEEKDAY_NAMES[day]} ${r.start}–${r.end}`} onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}>
                      <Dismiss size={13} />
                    </button>
                  </span>
                ))}
              </div>
              {ranges.length < MAX_RANGES_PER_DAY && (
                <button
                  className="icon-btn"
                  aria-label={`Add focus hours on ${WEEKDAY_NAMES[day]}`}
                  title="Add a time range"
                  onClick={() => {
                    const last = ranges.at(-1);
                    // A new range starts an hour after the last one ends, or at 9:00.
                    const startH = last ? Math.min(22, Number(last.end.slice(0, 2)) + 1) : 9;
                    const pad = (n: number) => String(n).padStart(2, "0");
                    setDay(day, [...ranges, { start: `${pad(startH)}:00`, end: `${pad(Math.min(23, startH + 2))}:${startH + 2 > 23 ? "59" : "00"}` }]);
                  }}
                >
                  <Add size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Distractions({ coach, set }: { coach: CoachSettings; set(patch: Partial<CoachSettings>): void }) {
  const [kind, setKind] = useState<Distraction["kind"]>("site");
  const [draft, setDraft] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const add = () => {
    const match = draft.trim();
    if (!match) return;
    set({ distractions: [...coach.distractions, { kind, match }] });
    setDraft("");
  };
  return (
    <div className="settings-block">
      <span className="settings-label">Distractions</span>
      <p className="hint">A site counts when its name is in a browser's window title. An app counts when it's the window in front.</p>
      <div className="distraction-chips">
        {coach.distractions.map((d) => (
          <span key={`${d.kind}:${d.match}`} className="distraction-chip">
            <span className="distraction-kind">{d.kind === "site" ? "Site" : "App"}</span>
            {d.match}
            <button
              className="icon-btn"
              aria-label={`Remove ${d.match}`}
              onClick={() => set({ distractions: coach.distractions.filter((x) => x !== d) })}
            >
              <Dismiss size={12} />
            </button>
          </span>
        ))}
        {coach.distractions.length === 0 && <span className="hint">None. Coach then only watches for idle time.</span>}
      </div>
      <div className="distraction-add">
        <div className="segmented" role="group" aria-label="Kind">
          {(["site", "app"] as const).map((k) => (
            <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "site" ? "Site" : "App"}
            </button>
          ))}
        </div>
        <input
          className="field"
          list={kind === "app" ? "coach-running-apps" : undefined}
          value={draft}
          placeholder={kind === "site" ? "e.g. YouTube" : "e.g. steam.exe"}
          aria-label={kind === "site" ? "Site name" : "App name"}
          spellCheck={false}
          onFocus={() => kind === "app" && invoke<string[]>("running_apps").then(setApps, () => setApps([]))}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <datalist id="coach-running-apps">
          {apps.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <button className="btn" disabled={!draft.trim()} onClick={add}>
          Add
        </button>
      </div>
      <div className="row-actions">
        <button onClick={() => set({ distractions: DEFAULT_DISTRACTIONS })}>Restore defaults</button>
      </div>
    </div>
  );
}

function RealTalkLines({ lines, onChange }: { lines: string[]; onChange(lines: string[]): void }) {
  const [draft, setDraft] = useState(lines.join("\n"));
  useEffect(() => setDraft(lines.join("\n")), [lines]);
  return (
    <div className="setting">
      <label className="settings-label" htmlFor="coach-lines">
        Your own lines
      </label>
      <textarea
        id="coach-lines"
        className="field coach-lines"
        rows={3}
        value={draft}
        placeholder={"One per line, e.g.\nFuture you is watching."}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(draft.split("\n"))}
      />
      <p className="hint">Mixed in with Coach's own real-talk lines. Use {"{reminder}"} for what's due.</p>
    </div>
  );
}
