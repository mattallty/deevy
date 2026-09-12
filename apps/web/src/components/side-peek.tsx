import { Link } from "@tanstack/react-router";
import { useRef } from "react";
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
import { peekBounds, usePeekWidth } from "@/lib/peek-width";
import { useShortcut, useShortcutScope } from "@/lib/shortcuts";
import { IssuePage } from "@/routes/issues/issue";

/**
 * An Issue beside the list it was picked from: the whole Issue page in a panel
 * on the right, without leaving (docs/plans/ui-redesign.md). The key it shows
 * rides in the URL as `?peek=`, so a view with a peek open is a link. `Esc`
 * closes it (the Sheet's own), `o` opens the full page.
 *
 * Three things make it read as the page it is showing rather than as a modal
 * over one. It is **wide enough for the Issue's own two-column layout**: the
 * page switches at `@3xl`, so a narrower panel stacked the rail on top of the
 * description and put the Issue in an order nothing else uses. There is **no
 * backdrop**, and it is **never modal** — the list behind it stays lit and
 * usable, which is also what keeps a drag alive on the Board.
 *
 * Its left edge is a handle: drag it to make the panel wider than the share of
 * the window it opens at, and the width is remembered for the next Issue you
 * peek at (`lib/peek-width.ts`).
 */
export function SidePeek({
  issueKey,
  onClose,
  onOpenFull,
}: {
  issueKey: string | null;
  onClose: () => void;
  onOpenFull: (key: string) => void;
}) {
  const open = issueKey !== null;
  useShortcutScope("peek", open);
  useShortcut("o", () => issueKey && onOpenFull(issueKey), { scope: "peek", enabled: open });

  const { width, settled, resize, remember, nudge } = usePeekWidth();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  /** Where the pointer is, as a width: the panel's right edge is fixed. */
  const widthFrom = (clientX: number) => {
    const started = drag.current;
    return started ? started.startWidth + (started.startX - clientX) : 0;
  };

  return (
    <Sheet open={open} modal={false} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        showOverlay={false}
        aria-label={issueKey ? `Issue ${issueKey}` : "Issue"}
        /*
         * The same variant chain as the base's `data-[side=right]:sm:max-w-sm`,
         * so this one replaces it, and three rules in one expression:
         * 45% of the window on a desktop, because the Issue inside is the whole
         * page now and a fixed width is either a gutter on a 34" display or too
         * much on a laptop; never under 56rem, which is what keeps the Issue's
         * own container over the `@3xl` it needs to lay out in two columns;
         * never over 92vw, so a hand's width of the list stays visible — the
         * reason to peek rather than navigate. Below `sm` none of it applies
         * and the sheet is the window, which is what a phone wants.
         */
        className="w-full gap-0 overflow-y-auto p-0 text-sm data-[side=right]:w-full data-[side=right]:sm:w-(--peek-width) data-[side=right]:sm:max-w-[92vw]"
        // A number once somebody has dragged the edge; the expression above
        // until then, so the first paint needs no JavaScript to be right.
        style={
          {
            "--peek-width": width === null ? "min(92vw,max(56rem,45vw))" : `${width}px`,
          } as React.CSSProperties
        }
        ref={panel}
      >
        {/*
         * The edge is the handle. `separator` with an orientation and a value
         * is what a window splitter is (WAI-ARIA), so the arrow keys move it
         * for anybody not holding a pointer, and `Home` puts it back.
         */}
        <div
          role="separator"
          aria-label="Resize the Issue panel"
          aria-orientation="vertical"
          aria-valuenow={Math.round((settled / (globalThis.innerWidth || 1)) * 100)}
          tabIndex={0}
          className="absolute inset-y-0 left-0 hidden w-3 cursor-col-resize touch-none hover:bg-border/60 focus-visible:bg-ring focus-visible:outline-none sm:block"
          onPointerDown={(press) => {
            const started = panel.current?.getBoundingClientRect().width || settled;
            drag.current = { startX: press.clientX, startWidth: started };
            // Not the browser's drag: without this the pointer selects the text
            // it passes over, and the handle never takes focus for the keys.
            press.preventDefault();
            press.currentTarget.focus();
            try {
              press.currentTarget.setPointerCapture(press.pointerId);
            } catch {
              // A pointer the browser has already forgotten: the move handler
              // still follows it, it just stops if it leaves the handle.
            }
          }}
          onPointerMove={(moved) => {
            if (drag.current) resize(widthFrom(moved.clientX));
          }}
          onPointerUp={(released) => {
            if (drag.current) remember(widthFrom(released.clientX));
            drag.current = null;
            try {
              released.currentTarget.releasePointerCapture(released.pointerId);
            } catch {
              // Nothing to release, which is the state we wanted anyway.
            }
          }}
          onKeyDown={(pressed) => {
            const step = pressed.shiftKey ? 96 : 24;
            if (pressed.key === "ArrowLeft") nudge(step);
            else if (pressed.key === "ArrowRight") nudge(-step);
            else if (pressed.key === "Home") remember(peekBounds(globalThis).min);
            else return;
            pressed.preventDefault();
          }}
        />
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
