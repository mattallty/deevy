/**
 * What an Event says (docs/plans/ui-redesign-2.md slice D), shared by the Issue's
 * Activity, the Event log and the Inbox: the sentence with the actor as its
 * subject and the object named — which Gate, which Labels, which State — the
 * words someone wrote as `detail`, and the tone the row takes. New Events carry
 * names beside ids (the core writes them); older ones are resolved through the
 * maps the caller has, and fall back to a plain sentence rather than an id.
 */
export type EventTone = "human" | "agent" | "gate" | "muted" | "destructive";

export interface EventText {
  text: string;
  detail: string | null;
  tone: EventTone;
  /** A Run's plain step, or a Document write: the kind an Agent's day is made of, foldable. */
  routine: boolean;
}

export interface EventLike {
  kind: string;
  payload: unknown;
  actorKind?: "human" | "agent" | null;
}

export interface EventContext {
  memberName?: (id: string) => string | null | undefined;
  labelName?: (id: string) => string | null | undefined;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const join = (items: string[]) => items.join(", ");

export function describeEvent(event: EventLike, context: EventContext = {}): EventText | null {
  const p =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {};
  const agentTone: EventTone = event.actorKind === "agent" ? "agent" : "muted";
  const say = (
    text: string,
    detail: string | null = null,
    tone: EventTone = "muted",
    routine = false,
  ) => ({
    text,
    detail,
    tone,
    routine,
  });
  const member = (id: unknown, name: unknown) =>
    str(name) ?? (typeof id === "string" ? (context.memberName?.(id) ?? null) : null);
  const labels = (ids: unknown, names: unknown) => {
    const named = list(names);
    if (named.length > 0) return named;
    return list(ids).map((id) => context.labelName?.(id) ?? "a Label");
  };

  switch (event.kind) {
    case "issue.created":
      return say("created this Issue");
    case "issue.updated": {
      const edits = p as { title?: { to?: unknown }; description?: unknown };
      if (edits.title?.to) return say(`renamed it to “${str(edits.title.to) ?? ""}”`);
      if (edits.description) return say("edited the description");
      return say("edited this Issue");
    }
    case "issue.assigned": {
      const to = member(p.to, p.toName);
      const from = member(p.from, p.fromName);
      const by = p.byStateRule ? " on entering the State" : "";
      if (!to) return say(`unassigned it${from ? ` (was ${from})` : ""}`);
      return say(`assigned it to ${to}${from ? ` (was ${from})` : ""}${by}`);
    }
    case "issue.reparented": {
      const to = str(p.toKey);
      const from = str(p.fromKey);
      if (!to) return say(`detached it from ${from ?? "its parent"}`);
      return say(`set the parent to ${to}${from ? ` (was ${from})` : ""}`);
    }
    case "issue.moved":
      return say(
        str(p.from) && str(p.to)
          ? `moved it from ${str(p.from) ?? ""} to ${str(p.to) ?? ""}`
          : "moved this Issue",
      );
    case "issue.labels_changed": {
      const added = labels(p.added, p.addedNames);
      const removed = labels(p.removed, p.removedNames);
      const parts = [
        added.length > 0
          ? `added ${added.length === 1 ? "the Label" : "Labels"} ${join(added)}`
          : null,
        removed.length > 0
          ? `removed ${removed.length === 1 ? "the Label" : "Labels"} ${join(removed)}`
          : null,
      ].filter((part): part is string => part !== null);
      return say(parts.length > 0 ? parts.join("; ") : "changed the Labels");
    }
    case "issue.link_added": {
      const url = str(p.url);
      let host: string | null = null;
      try {
        host = url ? new URL(url).host : null;
      } catch {
        host = null;
      }
      return say(
        `added a ${str(p.kind) ?? "link"}${host ? ` on ${host}` : ""}`,
        url,
        agentTone,
        true,
      );
    }
    case "issue.link_removed":
      return say("removed a link", str(p.url));
    case "document.created":
      return say(
        str(p.name) ? `opened the ${str(p.name) ?? ""} Document` : "opened a Document",
        null,
        "muted",
        true,
      );
    case "document.updated":
      return say(
        str(p.name)
          ? `wrote ${str(p.name) ?? ""}${typeof p.version === "number" ? ` v${String(p.version)}` : ""}`
          : "wrote a Document",
        null,
        agentTone,
        true,
      );
    case "gate.approved":
      return say(
        `approved the ${str(p.state) ?? ""} Gate → ${str(p.to) ?? ""}`.replace("  ", " "),
        str(p.note),
        "gate",
      );
    case "gate.rejected":
      return say(`rejected the ${str(p.state) ?? ""} Gate`, str(p.note), "destructive");
    case "run.started": {
      const trigger = str(p.trigger);
      const by =
        trigger === "assignment"
          ? ", by assignment"
          : trigger === "state_rule"
            ? ", by the State's rule"
            : trigger === "manual"
              ? ""
              : trigger
                ? `, by ${trigger}`
                : "";
      return say(`started a Run${by}`, null, "agent", true);
    }
    case "run.activity":
      return null; // The Run card shows its Activities; the stream would only repeat them.
    case "run.awaiting_input":
      return p.gateStateId
        ? say("is waiting at a Gate", null, "gate")
        : say("is waiting on a Human", str(p.question), "agent");
    case "run.answered":
      return say("answered the Run", null, "human");
    case "run.completed":
      return say("finished the Run", str(p.summary), "agent", true);
    case "run.failed":
      return say("failed the Run", str(p.summary), "destructive");
    case "run.went_stale":
      return say("went quiet", null, "muted");
    case "comment.created":
      return say("commented", null, "human");
    case "comment.edited":
      return say("edited a comment", null, "human");
    case "comment.deleted":
      return say("withdrew a comment", null, "human");
    case "member.joined":
      return say(`joined as ${str(p.role) ?? "a member"}`, null, "human");
    case "member.role_changed":
      return say(`changed the role from ${str(p.from) ?? "?"} to ${str(p.to) ?? "?"}`);
    case "member.suspended":
      return say("suspended a Member", null, "destructive");
    case "member.reinstated":
      return say("reinstated a Member");
    case "agent.created":
      return say(
        `created the Agent ${str(p.name) ?? ""}${str(p.handle) ? ` (@${str(p.handle) ?? ""})` : ""}`,
      );
    case "agent.updated":
      return say(`changed ${join(list(p.changed)) || "the Agent"}`);
    case "agent.sponsor_changed":
      return say(`changed the Sponsor to ${member(p.to, p.toName) ?? "another Human"}`);
    case "agent.key_issued":
      return say(`issued the API key ${str(p.name) ?? ""}`);
    case "agent.key_revoked":
      return say("revoked an API key", null, "destructive");
    case "agent.project_granted":
      return say(`granted ${str(p.projectKey) ?? "a Project"}`);
    case "agent.project_revoked":
      return say("revoked a Project", null, "destructive");
    case "project.created":
      return say(`created the Project ${str(p.key) ?? ""} ${str(p.name) ?? ""}`.trim());
    case "project.updated": {
      const changed = Object.keys(p);
      return say(`changed the Project's ${join(changed) || "settings"}`);
    }
    case "project.archived":
      return say(`archived ${str(p.key) ?? "the Project"}`, null, "destructive");
    case "team.created":
      return say(`created the Team ${str(p.name) ?? ""}`);
    case "team.updated":
      return say(`renamed the Team ${str(p.from) ?? ""} to ${str(p.to) ?? ""}`);
    case "team.deleted":
      return say(`deleted the Team ${str(p.name) ?? ""}`, null, "destructive");
    case "team.member_added":
      return say(`added ${member(p.memberId, null) ?? "a Member"} to the Team`);
    case "team.member_removed":
      return say(`removed ${member(p.memberId, null) ?? "a Member"} from the Team`);
    case "workflow.updated":
      return say(`set the Workflow to ${list(p.states).join(" → ")}`);
    case "label.created":
      return say(
        `created the Label ${str(p.scope) ? `${str(p.scope) ?? ""}: ` : ""}${str(p.name) ?? ""}`,
      );
    case "label.updated":
      return say(`renamed a Label to ${str(p.name) ?? ""}`);
    case "label.deleted":
      return say(
        `deleted the Label ${str(p.scope) ? `${str(p.scope) ?? ""}: ` : ""}${str(p.name) ?? ""}`,
        null,
        "destructive",
      );
    case "repository.created":
      return say(`added the Repository ${str(p.name) ?? ""}`, str(p.url));
    case "repository.deleted":
      return say(`removed the Repository ${str(p.name) ?? ""}`, null, "destructive");
    case "allowlist.rule_added":
      return say(`allowed ${str(p.kind) ?? ""} ${str(p.value) ?? ""}`.trim());
    case "allowlist.rule_removed":
      return say(
        `stopped allowing ${str(p.kind) ?? ""} ${str(p.value) ?? ""}`.trim(),
        null,
        "destructive",
      );
    case "channel.created":
      return say(`connected the Channel ${str(p.name) ?? ""}`);
    case "channel.updated":
      return say(`changed the Channel ${str(p.name) ?? ""}`);
    case "channel.deleted":
      return say(`removed the Channel ${str(p.name) ?? ""}`, null, "destructive");
    case "routing.updated":
      return say(
        typeof p.rules === "number"
          ? `set ${String(p.rules)} routing rules`
          : "changed the routing rules",
      );
    case "webhook.subscribed":
      return say(`subscribed a webhook on ${str(p.host) ?? "a host"}`);
    case "webhook.removed":
      return say(`removed a webhook on ${str(p.host) ?? "a host"}`, null, "destructive");
    case "webhook.exhausted":
      return say("gave up on a webhook delivery", str(p.error), "destructive");
    case "workspace.created":
      return say(`created the Workspace ${str(p.name) ?? ""}`);
    case "workspace.updated":
      return say(`renamed the Workspace to ${str(p.to) ?? ""}`);
    default:
      return say(event.kind);
  }
}
