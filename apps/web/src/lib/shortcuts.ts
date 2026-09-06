import { useEffect, useRef } from "react";

/**
 * Keyboard shortcuts for a keyboard-first UI (docs/plans/ui-redesign.md).
 *
 * One listener on the document, a registry of bindings, and a stack of scopes.
 * The scope stack is the whole design: an open Sheet, Dialog or palette pushes
 * a scope while it is mounted, and only bindings registered in the topmost
 * scope fire — plus the few marked `global`, like ⌘K — so a letter typed to
 * close a peek never also opens a picker on the list behind it.
 *
 * Binding syntax: keys joined with `+` for a combination (`mod+k`, `shift+a`),
 * separated by a space for a chord (`g i`). `mod` is ⌘ on a Mac and Ctrl
 * elsewhere. Plain letters are ignored while the Human is typing; combinations
 * with a modifier are not, which is what lets `mod+enter` submit a form.
 */

export type ShortcutHandler = (event: KeyboardEvent) => void;

export interface ShortcutOptions {
  /** Which scope must be on top for this binding to fire. Default: the page. */
  scope?: string;
  /** Fires whatever scope is on top. For ⌘K and the shortcut sheet, little else. */
  global?: boolean;
  /** A binding that is registered but off, so a hook can stay unconditional. */
  enabled?: boolean;
}

interface Binding extends Required<Pick<ShortcutOptions, "scope" | "global">> {
  keys: string;
  handler: ShortcutHandler;
}

export const PAGE_SCOPE = "page";
const CHORD_MS = 800;

const bindings = new Set<Binding>();
const scopes: string[] = [PAGE_SCOPE];
let pendingPrefix: { key: string; at: number } | null = null;
let installed = false;

/** Whether the keystroke belongs to something the Human is writing in. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** The single token a keydown is, in the binding syntax. */
export function tokenOf(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  // Shift is spelled out only when it changes nothing about the key itself:
  // `?` and `>` already are their shifted characters, `shift+a` is not `a`.
  if (event.shiftKey && (/^[a-z0-9]$/.test(key) || key.length > 1)) parts.push("shift");
  parts.push(key === " " ? "space" : key);
  return parts.join("+");
}

function activeScope(): string {
  return scopes[scopes.length - 1] ?? PAGE_SCOPE;
}

function candidates(): Binding[] {
  const top = activeScope();
  return [...bindings].filter((binding) => binding.global || binding.scope === top);
}

function dispatch(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  const token = tokenOf(event);
  const typing = isTyping(event.target);
  // A bare letter typed into a field is text, never a shortcut.
  if (typing && !token.includes("mod+") && token !== "escape") {
    pendingPrefix = null;
    return;
  }
  const now = Date.now();
  const prefix = pendingPrefix && now - pendingPrefix.at < CHORD_MS ? pendingPrefix.key : null;
  pendingPrefix = null;

  const live = candidates();
  if (prefix) {
    const chord = live.find((binding) => binding.keys === `${prefix} ${token}`);
    if (chord) {
      event.preventDefault();
      chord.handler(event);
      return;
    }
  }
  const exact = live.find((binding) => binding.keys === token);
  if (exact) {
    event.preventDefault();
    exact.handler(event);
    return;
  }
  // The first key of some chord: remember it and wait for the second.
  if (live.some((binding) => binding.keys.startsWith(`${token} `))) {
    event.preventDefault();
    pendingPrefix = { key: token, at: now };
  }
}

function install(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("keydown", dispatch);
}

/** Registers `handler` for `keys` while the component is mounted. */
export function useShortcut(keys: string, handler: ShortcutHandler, options: ShortcutOptions = {}) {
  const { scope = PAGE_SCOPE, global = false, enabled = true } = options;
  // The latest handler without re-registering on every render.
  const current = useRef(handler);
  current.current = handler;

  useEffect(() => {
    if (!enabled) return;
    install();
    const binding: Binding = {
      keys: keys.toLowerCase(),
      scope,
      global,
      handler: (event) => current.current(event),
    };
    bindings.add(binding);
    return () => {
      bindings.delete(binding);
    };
  }, [keys, scope, global, enabled]);
}

/**
 * Makes `name` the scope shortcuts fire in while the component is mounted and
 * `active`. A Sheet or Dialog calls it so the page behind it goes quiet.
 */
export function useShortcutScope(name: string, active = true) {
  useEffect(() => {
    if (!active) return;
    scopes.push(name);
    return () => {
      const index = scopes.lastIndexOf(name);
      if (index > 0) scopes.splice(index, 1);
    };
  }, [name, active]);
}

/** Whether this is a Mac, which decides how `mod` is drawn (kbd-hint.tsx). */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform) || /Mac/.test(navigator.userAgent);
}

/** The scope stack as it stands, for tests and the shortcut sheet. */
export function currentScope(): string {
  return activeScope();
}
