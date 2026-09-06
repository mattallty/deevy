import { Link, useRouter } from "@tanstack/react-router";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

/**
 * Where a URL leads nowhere: a route the router does not know, or an Issue or
 * Project the API says does not exist. Rendered inside the shell, so the
 * sidebar and ⌘K stay, and the page says what was looked for and offers the
 * two places most links come from.
 */
export function NotFoundPage({
  what,
  detail,
}: {
  /** What was looked for: an Issue key, a Project key, or nothing for a bare URL. */
  what?: string;
  /** Why, when the API said so: its message, verbatim. */
  detail?: string;
}) {
  const router = useRouter();
  const path = router.state.location.pathname;
  return (
    // The shell's page area is a stretched flex item, so full height is the whole area: centred in it.
    <Empty className="h-full gap-6">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-14 [&_svg]:size-7">
          <CompassIcon aria-hidden />
        </EmptyMedia>
        <h1 className="text-2xl font-semibold tracking-tight">
          {what ? `There is no ${what}` : "There is nothing here"}
        </h1>
        <EmptyDescription className="text-base">
          {detail ?? (
            <>
              Nothing lives at <code className="font-mono text-sm">{path}</code>. The link may be
              stale, or the page may have moved.
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" onClick={() => router.history.back()}>
          Go back
        </Button>
        <Button variant="outline" render={<Link to="/" />}>
          All Issues
        </Button>
        <Button variant="outline" render={<Link to="/inbox" />}>
          Inbox
        </Button>
      </div>
    </Empty>
  );
}

/** Whether an API error means the thing does not exist, as opposed to failing to load. */
export function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "NOT_FOUND"
  );
}
