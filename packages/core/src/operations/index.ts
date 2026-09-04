/**
 * The router: every operation the registry describes, in one object that oRPC
 * projects to HTTP, OpenAPI, the typed client and MCP tools (ADR-0005).
 *
 * Each area lives in its own module beside this one, and the lookups they share
 * live in `shared.ts`. Nothing here does any work: adding an operation means
 * editing one area's file, and two areas can be worked on at the same time.
 */
import { agents } from "./agents.ts";
import { allowlist } from "./allowlist.ts";
import { channels } from "./channels.ts";
import { comments } from "./comments.ts";
import { documents } from "./documents.ts";
import { events } from "./events.ts";
import { gates } from "./gates.ts";
import { inbox } from "./inbox.ts";
import { issues } from "./issues.ts";
import { labels } from "./labels.ts";
import { links } from "./links.ts";
import { members } from "./members.ts";
import { oauthClients } from "./oauth-clients.ts";
import { preferences } from "./preferences.ts";
import { projects } from "./projects.ts";
import { repositories } from "./repositories.ts";
import { routing } from "./routing.ts";
import { runs } from "./runs.ts";
import { health, me } from "./system.ts";
import { teams } from "./teams.ts";
import { webhooks } from "./webhooks.ts";
import { workflow } from "./workflow.ts";
import { workspace } from "./workspace.ts";

export const router = {
  runs,
  health,
  me,
  workspace,
  events,
  members,
  agents,
  allowlist,
  projects,
  teams,
  issues,
  gates,
  workflow,
  documents,
  labels,
  comments,
  repositories,
  links,
  inbox,
  channels,
  routing,
  preferences,
  oauthClients,
  webhooks,
};
export type AppRouter = typeof router;

export {
  agents,
  allowlist,
  channels,
  comments,
  documents,
  events,
  gates,
  health,
  inbox,
  issues,
  labels,
  links,
  me,
  members,
  oauthClients,
  preferences,
  projects,
  repositories,
  routing,
  runs,
  teams,
  webhooks,
  workflow,
  workspace,
};
