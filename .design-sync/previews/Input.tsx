import { Input, Label } from "@deevy/design-system";

/** 32px tall, 14px text, on the card surface. The Issue title is the input deevy types into most. */
export const Default = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="input-title">Title</Label>
    <Input id="input-title" placeholder="Add ruling authority to Gate" />
  </div>
);

export const WithValue = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="input-document">Document it asks for</Label>
    <Input id="input-document" defaultValue="spec" placeholder="intent, spec, plan… or nothing" />
  </div>
);

/** Muted surface at half opacity; the cursor says not-allowed. */
export const Disabled = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="input-key">Project key</Label>
    <Input id="input-key" defaultValue="DEV" disabled />
  </div>
);

/** `aria-invalid` paints the border and a soft ring in destructive; the message sits below. */
export const Invalid = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="input-name">Name</Label>
    <Input id="input-name" defaultValue="" aria-invalid placeholder="Project name" />
    <p className="text-xs text-destructive">A Project needs a name.</p>
  </div>
);

/** A plain search box; the Issues list filters as you type. */
export const Search = () => (
  <div className="w-full max-w-sm">
    <Input type="search" aria-label="Search Issues" placeholder="Search Issues…" />
  </div>
);

/** Types the browser draws differently still get the same frame. */
export const Types = () => (
  <div className="flex w-full max-w-sm flex-col gap-3">
    <Input type="email" placeholder="ada@example.com" aria-label="Email" />
    <Input
      type="url"
      defaultValue="https://deevy.example.com/api/events"
      aria-label="Webhook URL"
    />
    <Input type="number" defaultValue={3} min={1} aria-label="Retries" className="w-24" />
  </div>
);
