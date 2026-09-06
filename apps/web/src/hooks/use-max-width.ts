import { useEffect, useState } from "react";

/**
 * Whether the viewport is narrower than `px`, kept current as it resizes.
 * False on the first render, so the server-less first paint is the desktop
 * layout; the media query decides from the first effect on. The shadcn
 * `use-mobile` hook is the registry's and fixed at 768: a screen that folds
 * at another width (the Inbox's two panes, at 1024) asks here.
 */
export function useMaxWidth(px: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${String(px - 1)}px)`);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [px]);
  return matches;
}
