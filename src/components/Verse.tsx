import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Minus } from "lucide-react";
import { dayKey } from "../calendar";
import { isMinimized, verseClipboardText, verseFor } from "../verse";
import type { Verse } from "../verses";

/** Smallest floating panel: one line of verse text and the reference. */
const MIN_PANEL_PX = 56;
/** The panel never takes more than this share of the floating window, so reminders stay visible. */
const MAX_PANEL_SHARE = 2 / 3;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // How the verse is shown is a convenience only.
  }
}

/** A value kept in this browser's storage, so each window remembers its own. */
function useLocal<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readLocal(key, fallback));
  return [
    value,
    (next: T) => {
      setValue(next);
      writeLocal(key, next);
    },
  ];
}

/** Minimized state for one window: the day it was minimized on, which lapses at midnight. */
function useMinimized(key: string, now: Date): [boolean, (minimized: boolean) => void] {
  const [day, setDay] = useLocal<string | null>(key, null);
  return [isMinimized(day, now), (minimized) => setDay(minimized ? dayKey(now) : null)];
}

/** The verse text and reference. Clicking the text copies both. */
function VerseText({ verse, clamp, onExpand }: { verse: Verse; clamp?: boolean; onExpand?(): void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard.writeText(verseClipboardText(verse)).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };

  return (
    <>
      <button
        className={`verse-text${clamp ? " clamped" : ""}`}
        title={clamp ? "Show the whole verse" : "Copy the verse"}
        onClick={clamp ? onExpand : copy}
      >
        {verse.text}
      </button>
      <span className="verse-ref">
        {verse.ref}
        {copied && <span className="verse-copied">Copied</span>}
      </span>
    </>
  );
}

function MinimizedBar({ verse, onRestore }: { verse: Verse; onRestore(): void }) {
  return (
    <button className="verse-bar" title="Show the verse of the day" onClick={onRestore}>
      <BookOpen size={13} />
      <span className="verse-bar-ref">{verse.ref}</span>
      <ChevronUp size={13} />
    </button>
  );
}

/** The verse of the day in the main window's sidebar, above the Pomodoro timer. */
export function VerseCard({ now }: { now: Date }) {
  const verse = verseFor(now);
  const [minimized, setMinimized] = useMinimized("remme.verse.main.minimizedOn", now);
  const [short, setShort] = useLocal("remme.verse.main.short", false);

  if (minimized) {
    return (
      <section className="verse-card minimized" aria-label="Verse of the day">
        <MinimizedBar verse={verse} onRestore={() => setMinimized(false)} />
      </section>
    );
  }
  return (
    <section className="verse-card" aria-label="Verse of the day">
      <div className="verse-head">
        <span className="verse-label">Verse of the day</span>
        <button
          className="icon-btn"
          title={short ? "Show the whole verse" : "Show 2 lines"}
          onClick={() => setShort(!short)}
        >
          {short ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        <button className="icon-btn" title="Minimize the verse" onClick={() => setMinimized(true)}>
          <Minus size={13} />
        </button>
      </div>
      <VerseText verse={verse} clamp={short} onExpand={() => setShort(false)} />
    </section>
  );
}

/** The verse of the day at the bottom of the floating list, with a drag handle to set its height. */
export function VersePanel({ now, locked }: { now: Date; locked: boolean }) {
  const verse = verseFor(now);
  const [minimized, setMinimized] = useMinimized("remme.verse.float.minimizedOn", now);
  /** The height dragged to, in pixels; null fits the verse until it is first dragged. */
  const [height, setHeight] = useLocal<number | null>("remme.verse.float.height", null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const maxHeight = Math.max(MIN_PANEL_PX, Math.floor(windowHeight * MAX_PANEL_SHARE));
  const clamp = (h: number) => Math.min(maxHeight, Math.max(MIN_PANEL_PX, Math.round(h)));
  const shown = dragHeight ?? height;

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked || !panel.current) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startHeight = panel.current.getBoundingClientRect().height;
    let latest = startHeight;
    const move = (ev: PointerEvent) => {
      latest = clamp(startHeight + startY - ev.clientY);
      setDragHeight(latest);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setHeight(clamp(latest));
      setDragHeight(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  if (minimized) {
    return (
      <section className="verse-panel minimized" aria-label="Verse of the day">
        <MinimizedBar verse={verse} onRestore={() => setMinimized(false)} />
      </section>
    );
  }
  return (
    <section
      ref={panel}
      className="verse-panel"
      aria-label="Verse of the day"
      style={shown === null ? { maxHeight } : { height: Math.min(shown, maxHeight) }}
    >
      {!locked && (
        <div
          className="verse-handle"
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize the verse"
          onPointerDown={startDrag}
          onDoubleClick={() => setHeight(null)}
        />
      )}
      <div className="verse-scroll">
        <VerseText verse={verse} />
      </div>
      {!locked && (
        <button className="icon-btn verse-minimize" title="Minimize the verse" onClick={() => setMinimized(true)}>
          <Minus size={13} />
        </button>
      )}
    </section>
  );
}
