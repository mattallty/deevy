import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How wide the Issue peek is, and how wide it is allowed to get.
 *
 * The floor is the width the peek had before it could be dragged at all: 45%
 * of the window, never under 56rem — what the Issue's own two-column layout
 * needs — and never over 92vw, so a hand's width of the list stays visible.
 * Dragging only ever makes it wider than that floor, up to the same 92vw
 * ceiling; below `sm` none of it applies, because there the sheet is the
 * window.
 */
const FLOOR_SHARE = 0.45;
const CEILING_SHARE = 0.92;
const FLOOR_REM = 56;

const STORAGE_KEY = "deevy:peek-width";

function rem(): number {
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/** The narrowest and widest this window allows, in pixels. */
export function peekBounds(window: { innerWidth: number }): { min: number; max: number } {
  const max = window.innerWidth * CEILING_SHARE;
  const min = Math.min(max, Math.max(FLOOR_REM * rem(), window.innerWidth * FLOOR_SHARE));
  return { min, max };
}

function clampToWindow(width: number): number {
  const { min, max } = peekBounds(globalThis.window);
  return Math.min(Math.max(width, min), max);
}

/** What the last drag left, if it still fits this window. */
function remembered(): number | null {
  try {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampToWindow(stored) : null;
  } catch {
    // A browser that refuses storage is a browser that gets the default width.
    return null;
  }
}

/**
 * The peek's width as a number of pixels, or `null` for "whatever the stylesheet
 * says" — which is the floor, expressed in CSS so it needs no JavaScript to be
 * right on the first paint. A drag replaces it with a number and remembers it;
 * a window that shrinks under a remembered width brings it back into range.
 */
export function usePeekWidth() {
  const [width, setWidth] = useState<number | null>(null);
  /*
   * The same number, readable without a render. A key held down sends its
   * repeats faster than React re-renders, and every one of them has to build on
   * the last: reading `width` out of the closure made sixty presses move the
   * edge once, because all sixty read the width the first of them saw.
   */
  const latest = useRef<number | null>(null);

  const put = useCallback((next: number | null) => {
    latest.current = next;
    setWidth(next);
  }, []);

  // Read the remembered width after mount rather than during render: it is the
  // one thing here that the server (and a test's first paint) cannot know.
  useEffect(() => put(remembered()), [put]);

  useEffect(() => {
    const onResize = () => {
      if (latest.current !== null) put(clampToWindow(latest.current));
    };
    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, [put]);

  /** During a drag: follow the pointer, without writing anything down. */
  const resize = useCallback((next: number) => put(clampToWindow(next)), [put]);

  /** At the end of one, or after a key: this is the width from now on. */
  const remember = useCallback(
    (next: number) => {
      const clamped = clampToWindow(next);
      put(clamped);
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, String(Math.round(clamped)));
      } catch {
        // Not being able to remember is not a reason to refuse the drag.
      }
      return clamped;
    },
    [put],
  );

  /**
   * Wider by `by` pixels than it is now. Where it is now, before anybody has
   * dragged it, is the floor — the stylesheet's `min(92vw,max(56rem,45vw))` is
   * `peekBounds().min` written in CSS — so this needs no measuring, and behaves
   * the same in a test with no layout as in a browser with one.
   */
  const nudge = useCallback(
    (by: number) => remember((latest.current ?? peekBounds(globalThis).min) + by),
    [remember],
  );

  /** What it is now, for anything that has to say so out loud. */
  const settled = width ?? peekBounds(globalThis).min;

  return { width, settled, resize, remember, nudge };
}
