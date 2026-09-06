import { RunStatus } from "@deevy/design-system";

/** Every status a Run can have, in the order it usually goes. */
export const Statuses = () => (
  <div className="flex flex-wrap items-center gap-2">
    <RunStatus status="pending" />
    <RunStatus status="active" />
    <RunStatus status="awaiting_input" />
    <RunStatus status="completed" />
    <RunStatus status="failed" />
    <RunStatus status="stale" />
  </div>
);

/** The wording overridden on a Gate. */
export const CustomLabel = () => (
  <div className="flex flex-wrap items-center gap-2">
    <RunStatus status="awaiting_input" label="Waiting for approval" />
    <RunStatus status="active" label="Writing the spec" />
  </div>
);
