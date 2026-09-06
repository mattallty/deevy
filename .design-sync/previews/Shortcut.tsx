import { Button, Shortcut } from "@deevy/design-system";

/** A combination, a chord, a single key. */
export const Kinds = () => (
  <div className="flex flex-wrap items-center gap-6">
    <Shortcut keys="mod+k" />
    <Shortcut keys="g i" />
    <Shortcut keys="c" />
    <Shortcut keys="mod+enter" />
    <Shortcut keys="shift+a" />
  </div>
);

/** Beside the thing it triggers, never instead of a label. */
export const BesideActions = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="outline">
      Search <Shortcut keys="mod+k" />
    </Button>
    <Button variant="outline">
      New Issue <Shortcut keys="c" />
    </Button>
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      Go to Inbox <Shortcut keys="g i" />
    </span>
  </div>
);
