import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * What names a section of the Issue's rail — State, Assignee, Labels, Parent,
 * Children, Links. Small, quiet and the same in every one of them: the rail is
 * the Issue's metadata, and 12px is what deevy sets metadata in. The page's own
 * sections beside it — Documents, Runs, Activity — are the 14px headings of a
 * column somebody reads, and are not these.
 *
 * It exists because six places used to spell this out themselves, and three of
 * them had drifted two pixels bigger than the others (2026-09-11).
 */
export function RailHeading({
  children,
  id,
  className,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <h2
      {...(id ? { id } : {})}
      className={cn("text-xs font-medium text-muted-foreground", className)}
    >
      {children}
    </h2>
  );
}
