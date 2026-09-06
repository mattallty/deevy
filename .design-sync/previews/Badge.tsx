import { Badge } from "@deevy/design-system";
import { Bot, Check, X } from "lucide-react";

/** The six looks, each with the word deevy puts in it. */
export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Approved</Badge>
    <Badge variant="secondary">Agent</Badge>
    <Badge variant="outline">Archived</Badge>
    <Badge variant="destructive">Suspended</Badge>
    <Badge variant="ghost">Draft</Badge>
    <Badge variant="link">DEV-42</Badge>
  </div>
);

/** Where the app puts them: a role, a Member's kind, an API key's state, a Gate's decision. */
export const InContext = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <span className="font-medium">Grace Hopper</span>
      <Badge variant="outline">admin</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-medium">Builder</span>
      <Badge variant="secondary">Agent</Badge>
      <Badge variant="destructive">Suspended</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-medium">old laptop</span>
      <code className="font-mono text-xs text-muted-foreground">dvy_a3xz…</code>
      <Badge variant="outline">Disabled</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">Review Gate</span>
      <Badge>Approved</Badge>
      <Badge variant="destructive">Rejected</Badge>
    </div>
  </div>
);

/** A lucide icon at either end sits at 12px and pulls the padding in. */
export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>
      <Check data-icon="inline-start" /> Approved
    </Badge>
    <Badge variant="destructive">
      <X data-icon="inline-start" /> Rejected
    </Badge>
    <Badge variant="secondary">
      <Bot data-icon="inline-start" /> Agent
    </Badge>
    <Badge variant="outline">
      3 <span className="text-muted-foreground">open</span>
    </Badge>
  </div>
);
