import { BookOpen, ChevronDown, ChevronUp } from "../icons";
import { useEffect, useRef, useState } from "react";
import { verseClipboardText, verseFor } from "../verse";
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

/** The collapsed verse: the reference and the start of the verse on one line. */
function VerseBar({ verse, onExpand }: { verse: Verse; onExpand(): void }) {
  return (
    <button
      className="verse-bar"
      aria-expanded={false}
      aria-label={`Verse of the day, ${verse.ref}. Show the whole verse`}
      title={`${verse.text} (${verse.ref})`}
      onClick={onExpand}
    >
      <BookOpen size={13} />
      <span className="side-strip-text">
        <b>{verse.ref}</b> · {verse.text}
      </span>
      <ChevronUp size={13} />
    </button>
  );
}

/**
 * The verse of the day in the main window's sidebar, above the timer: a one-line bar with the
 * reference and the start of the verse, which expands to the whole verse. Collapsed by default.
 */
export function VerseCard({ now }: { now: Date }) {
  const verse = verseFor(now);
  const [open, setOpen] = useLocal("remme.verse.main.open", false);

  if (!open) {
    return (
      <button
        className="side-strip verse-strip"
        aria-expanded={false}
        aria-label={`Verse of the day, ${verse.ref}. Show the whole verse`}
        title={`${verse.text} (${verse.ref})`}
        onClick={() => setOpen(true)}
      >
        <BookOpen size={14} />
        <span className="side-strip-text">
          <b>{verse.ref}</b> · {verse.text}
        </span>
        <ChevronUp size={13} />
      </button>
    );
  }
  return (
    <section className="verse-card" aria-label="Verse of the day">
      <div className="verse-head">
        <span className="verse-label">Verse of the day</span>
        <button className="icon-btn" aria-label="Collapse the verse" title="Collapse" aria-expanded onClick={() => setOpen(false)}>
          <ChevronDown size={13} />
        </button>
      </div>
      <VerseText verse={verse} />
    </section>
  );
}

/** The verse of the day at the bottom of the floating list, with a drag handle to set its height. */
export function VersePanel({ now, locked }: { now: Date; locked: boolean }) {
  const verse = verseFor(now);
  const [open, setOpen] = useLocal("remme.verse.float.open", false);
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

  if (!open) {
    return (
      <section className="verse-panel minimized" aria-label="Verse of the day">
        <VerseBar verse={verse} onExpand={() => setOpen(true)} />
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
        <button className="icon-btn verse-minimize" aria-label="Collapse the verse" title="Collapse" aria-expanded onClick={() => setOpen(false)}>
          <ChevronDown size={13} />
        </button>
      )}
    </section>
  );
}
