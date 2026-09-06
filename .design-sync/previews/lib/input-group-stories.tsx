import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Kbd,
  Label,
} from "@deevy/design-system";
import { Copy, Link2, Search, Send, X } from "lucide-react";

/** A search with the shortcut that opens it at the end. */
export const SearchWithShortcut = () => (
  <div className="w-full max-w-sm">
    <InputGroup>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search Issues…" aria-label="Search Issues" />
      <InputGroupAddon align="inline-end">
        <Kbd>/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  </div>
);

/** A fixed prefix: the scheme is not up for editing. */
export const UrlPrefix = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="ig-webhook">Webhook URL</Label>
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput id="ig-webhook" defaultValue="hooks.example.com/deevy/events" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Copy">
          <Copy />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
);

/** A textarea with the send button below: a comment on an Issue. */
export const CommentWithSend = () => (
  <div className="w-full max-w-sm">
    <InputGroup>
      <InputGroupTextarea
        rows={3}
        placeholder="Comment on DEV-42… @mention a Member to notify them."
        aria-label="Comment"
      />
      <InputGroupAddon align="block-end">
        <InputGroupText>Markdown</InputGroupText>
        <InputGroupButton className="ml-auto" variant="default" size="sm">
          Send <Send data-icon="inline-end" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
);

/** A filled value with a clear button; an invalid group paints its whole frame. */
export const ClearAndInvalid = () => (
  <div className="flex w-full max-w-sm flex-col gap-3">
    <InputGroup>
      <InputGroupInput defaultValue="assignee:planner state:review" aria-label="Filter" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Clear">
          <X />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    <InputGroup>
      <InputGroupAddon>
        <Link2 />
      </InputGroupAddon>
      <InputGroupInput defaultValue="not a url" aria-invalid aria-label="Repository URL" />
    </InputGroup>
  </div>
);

/** A heading above the control, and an action in the same frame. */
export const BlockStart = () => (
  <div className="w-full max-w-sm">
    <InputGroup>
      <InputGroupAddon align="block-start" className="border-b">
        <InputGroupText>API key</InputGroupText>
        <Button variant="ghost" size="xs" className="ml-auto" type="button">
          Regenerate
        </Button>
      </InputGroupAddon>
      <InputGroupInput
        readOnly
        defaultValue="dvy_k3f9a2…c8e1"
        className="font-mono"
        aria-label="API key"
      />
    </InputGroup>
  </div>
);
