import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { orpc } from "@/lib/orpc";
import {
  DEFAULT_CANDIDATE,
  isThemeCandidate,
  themeCandidates,
  type ThemeCandidateId,
} from "./theme-candidates";

const STORAGE_KEY = "deevy.theme-candidate";

function readCandidate(): ThemeCandidateId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeCandidate(stored) ? stored : DEFAULT_CANDIDATE;
  } catch {
    return DEFAULT_CANDIDATE;
  }
}

/** Puts the candidate on <html>, where src/dev/theme-candidates.css looks for it. */
export function applyCandidate(id: ThemeCandidateId) {
  const root = document.documentElement;
  if (id === DEFAULT_CANDIDATE) delete root.dataset.themeCandidate;
  else root.dataset.themeCandidate = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // A browser that blocks storage still gets the candidate for this page.
  }
}

/**
 * The round-2 theme review (docs/plans/ui-redesign-2.md, slice A): a floating
 * control that applies one whole candidate — colours, type, radius, density —
 * to the real app while browsing it. Development only, and only on an instance
 * whose GitHub is the stub, so it never reaches a Human at work.
 */
export function ThemeCandidateSwitcher() {
  const health = useQuery(orpc.health.ping.queryOptions());
  const shown = import.meta.env.DEV && health.data?.devSignIn === true;
  const [current, setCurrent] = useState<ThemeCandidateId>(readCandidate);

  useEffect(() => {
    if (shown) applyCandidate(current);
  }, [shown, current]);

  if (!shown) return null;
  const chosen = themeCandidates.find((candidate) => candidate.id === current);
  return (
    <div className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <span className="text-muted-foreground">Theme</span>
      <NativeSelect
        aria-label="Theme candidate"
        className="h-7 w-52 text-xs"
        value={current}
        onChange={(changed) => {
          if (isThemeCandidate(changed.target.value)) setCurrent(changed.target.value);
        }}
      >
        {themeCandidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label} · {candidate.font} · {candidate.radiusPx}px
          </option>
        ))}
      </NativeSelect>
      {chosen ? (
        <span className="hidden text-muted-foreground lg:inline">{chosen.note}</span>
      ) : null}
    </div>
  );
}
