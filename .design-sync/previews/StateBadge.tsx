import { StateBadge } from "@deevy/design-system";
import { states } from "./lib/fixtures";

/** A dot per category; a Gate is the amber diamond, the one warm colour on a screen. */
export const Workflow = () => (
  <div className="flex flex-wrap items-center gap-6">
    <StateBadge state={states.backlog} />
    <StateBadge state={states.todo} />
    <StateBadge state={states.inProgress} />
    <StateBadge state={states.review} />
    <StateBadge state={states.done} />
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-6">
    <StateBadge state={states.inProgress} size="sm" />
    <StateBadge state={states.inProgress} size="md" />
    <StateBadge state={states.review} size="sm" />
    <StateBadge state={states.review} size="md" />
  </div>
);
