import { Toggle } from "@deevy/design-system";
import { Bell, Bot, Eye } from "lucide-react";

/** Pressed, it tints with the action colour; unpressed it is quiet. */
export const PressedAndNot = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Toggle aria-label="Watch this Issue" defaultPressed>
      <Bell data-icon="inline-start" /> Watching
    </Toggle>
    <Toggle aria-label="Watch this Issue">
      <Bell data-icon="inline-start" /> Watch
    </Toggle>
  </div>
);

/** Outline: on, the border tints with the fill. */
export const Outline = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Toggle variant="outline" aria-label="Show Agents' Issues" defaultPressed>
      <Bot data-icon="inline-start" /> Agents
    </Toggle>
    <Toggle variant="outline" aria-label="Show Agents' Issues">
      <Bot data-icon="inline-start" /> Agents
    </Toggle>
  </div>
);

/** The same heights as Button, so a toggle beside one lines up. */
export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Toggle variant="outline" size="sm" aria-label="Watch" defaultPressed>
      <Eye data-icon="inline-start" /> Small
    </Toggle>
    <Toggle variant="outline" aria-label="Watch" defaultPressed>
      <Eye data-icon="inline-start" /> Default
    </Toggle>
    <Toggle variant="outline" size="lg" aria-label="Watch" defaultPressed>
      <Eye data-icon="inline-start" /> Large
    </Toggle>
  </div>
);

/** Icon only, and disabled. */
export const IconOnlyAndDisabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Toggle variant="outline" aria-label="Watch" defaultPressed>
      <Eye />
    </Toggle>
    <Toggle variant="outline" aria-label="Watch">
      <Eye />
    </Toggle>
    <Toggle variant="outline" aria-label="Watch" disabled>
      <Eye data-icon="inline-start" /> Watch
    </Toggle>
  </div>
);
