import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Shortcut } from "@/components/kbd-hint";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useShortcut, useShortcutScope } from "@/lib/shortcuts";
import { IssuePage } from "@/routes/issues/issue";

/**
 * An Issue beside the list it was picked from, in a panel on the right: the
 * whole Issue page, in 720px, without leaving (docs/plans/ui-redesign.md). The
 * key it shows rides in the URL as `?peek=`, so a view with a peek open is a
 * link. `Esc` closes it (the Sheet's own), `o` opens the full page.
 */
export function SidePeek({
  issueKey,
  onClose,
  onOpenFull,
  modal = true,
}: {
  issueKey: string | null;
  onClose: () => void;
  onOpenFull: (key: string) => void;
  /**
   * Off on the Board: a modal Dialog puts `pointer-events: none` on everything
   * behind it, which kills a drag (docs/plans/ui-redesign.md, risks).
   */
  modal?: boolean;
}) {
  const open = issueKey !== null;
  useShortcutScope("peek", open);
  useShortcut("o", () => issueKey && onOpenFull(issueKey), { scope: "peek", enabled: open });

  return (
    <Sheet open={open} modal={modal} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        aria-label={issueKey ? `Issue ${issueKey}` : "Issue"}
        // The same variant chain as the base's `data-[side=right]:sm:max-w-sm`, so this one replaces it.
        className="w-full gap-0 overflow-y-auto p-0 text-sm data-[side=right]:w-full data-[side=right]:sm:max-w-[720px]"
      >
        <SheetHeader className="flex-row items-center gap-2 border-b px-4 py-2 pr-12 text-left">
          <SheetTitle className="font-mono text-sm font-medium">{issueKey}</SheetTitle>
          <SheetDescription className="sr-only">An Issue, beside the list</SheetDescription>
          <span className="flex-1" />
          {issueKey ? (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link to="/issues/$issueKey" params={{ issueKey }} />}
            >
              <ExternalLink />
              Open full page
              <Shortcut keys="o" />
            </Button>
          ) : null}
        </SheetHeader>
        <div className="p-6">
          {issueKey ? <IssuePage issueKey={issueKey} shortcutScope="peek" /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
