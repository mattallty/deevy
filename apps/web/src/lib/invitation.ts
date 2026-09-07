/**
 * An invitation is a link, and the link is a bearer token in its path
 * (docs/plans/sign-in.md slice 8). Whoever clicks one is by definition not a
 * Member yet, so the SPA answers `/invite/<token>` before the router exists
 * (`App.tsx` renders it only for a Member) and holds the token across the
 * sign-in that follows.
 *
 * `sessionStorage`, not `localStorage`: the OAuth dance leaves the SPA and
 * comes back to the same tab, which is exactly as long as a link somebody was
 * sent should live on their machine. Every access is guarded, because a
 * browser that refuses storage should still be able to sign in.
 */
const HELD = "deevy.invitation";

/** The token in `/invite/<token>`, or null for any other path. */
export function invitationInPath(pathname: string): string | null {
  const match = /^\/invite\/([^/?#]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}

/** Keep it for the sign-in to come back to. */
export function holdInvitation(token: string): void {
  try {
    window.sessionStorage.setItem(HELD, token);
  } catch {
    // A browser with storage turned off signs in the same way; it just cannot
    // carry the token past the redirect, and says so on the screen it lands on.
  }
}

/** The token this tab is holding, if any. */
export function heldInvitation(): string | null {
  try {
    return window.sessionStorage.getItem(HELD);
  } catch {
    return null;
  }
}

/** Spent, refused for good, or the Human is already in: stop holding it. */
export function dropInvitation(): void {
  try {
    window.sessionStorage.removeItem(HELD);
  } catch {
    // Nothing was held if nothing could be stored.
  }
}
