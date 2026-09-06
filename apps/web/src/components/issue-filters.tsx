import { Bot, User, Kanban, List } from "lucide-react";
import type { ChipMember } from "@/components/member-chip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** The filters, as they ride in the URL: a view is a link (docs/plans/ui-redesign.md). */
export interface IssuesSearch {
  /** A Project key, or absent for every Project. */
  project?: string;
  /** A State name, folded across Projects. */
  state?: string;
  /** A Member id, `me`, `agents:me` (the Agents I sponsor), or `none`. */
  assignee?: string;
  kind?: "human" | "agent";
  /** `0` shows closed Issues too; the default is open ones. */
  open?: "0" | "1";
  group?: "state" | "none";
  /** The list, or the board: the same Issues as columns by State (slice F). */
  view?: "list" | "board";
  q?: string;
  peek?: string;
}

/** Reads the URL's search into the filters, dropping anything it does not know. */
export function parseIssuesSearch(search: Record<string, unknown>): IssuesSearch {
  // A raw URL's `open=0` parses as the number 0; navigate() hands over "0".
  const text = (key: keyof IssuesSearch) => {
    const value = search[key];
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  const kind = text("kind");
  const open = text("open");
  const group = text("group");
  const view = text("view");
  return {
    ...(text("project") ? { project: text("project") } : {}),
    ...(text("state") ? { state: text("state") } : {}),
    ...(text("assignee") ? { assignee: text("assignee") } : {}),
    ...(kind === "human" || kind === "agent" ? { kind } : {}),
    ...(open === "0" || open === "1" ? { open } : {}),
    ...(group === "state" || group === "none" ? { group } : {}),
    ...(view === "board" ? { view } : {}),
    ...(text("q") ? { q: text("q") } : {}),
    ...(text("peek") ? { peek: text("peek") } : {}),
  };
}

const ANY = "__any";

export interface FilterState {
  name: string;
  isGate: boolean;
  category: "backlog" | "active" | "done";
}

/**
 * The bar above an Issue list. Every control writes to the URL through
 * `onChange`, so Back undoes a filter and a filtered view can be sent to
 * someone. Single choices for now; the multi-select chips wait for a list that
 * needs them.
 */
export function IssueFilters({
  value,
  onChange,
  projects,
  states,
  members,
  sponsorsAgents,
  hideProject = false,
  hideGroup = false,
  showView = false,
}: {
  value: IssuesSearch;
  onChange: (patch: Partial<IssuesSearch>) => void;
  projects: Array<{ key: string; name: string }>;
  states: FilterState[];
  members: Array<ChipMember & { sponsorId?: string | null }>;
  /** Whether the signed-in Human sponsors any Agent, which is when "My Agents" is offered. */
  sponsorsAgents: boolean;
  hideProject?: boolean;
  /** On a board the rows are already grouped; the Group control would lie. */
  hideGroup?: boolean;
  /** Offer List / Board (the Workspace lists; a Project has its Board tab). */
  showView?: boolean;
}) {
  const humans = members.filter((member) => member.kind === "human");
  const agents = members.filter((member) => member.kind === "agent");
  const memberById = new Map(members.map((member) => [member.id, member]));

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      {hideProject ? null : (
        <Select
          value={value.project ?? ANY}
          onValueChange={(next) =>
            onChange({ project: next === ANY || next === null ? undefined : next })
          }
        >
          <SelectTrigger aria-label="Project" className="w-40">
            <SelectValue>
              {(selected: string) =>
                selected === ANY
                  ? "All Projects"
                  : (projects.find((project) => project.key === selected)?.name ?? selected)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ANY}>All Projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.key} value={project.key}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      <Select
        value={value.state ?? ANY}
        onValueChange={(next) =>
          onChange({ state: next === ANY || next === null ? undefined : next })
        }
      >
        <SelectTrigger aria-label="State" className="w-36">
          <SelectValue>
            {(selected: string) => (selected === ANY ? "Any State" : selected)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={ANY}>Any State</SelectItem>
            {states.map((state) => (
              <SelectItem key={state.name} value={state.name}>
                {state.name}
                {/* The diamond every StateBadge wears, beside the name. */}
                {state.isGate ? (
                  <>
                    <span
                      aria-hidden
                      className="inline-block size-2 self-center rotate-45 rounded-[1px] border-[1.5px] border-gate bg-gate/20"
                    />
                    <span className="sr-only">Gate</span>
                  </>
                ) : null}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={value.assignee ?? ANY}
        onValueChange={(next) =>
          onChange({ assignee: next === ANY || next === null ? undefined : next })
        }
      >
        <SelectTrigger aria-label="Assignee" className="w-44">
          <SelectValue>
            {(selected: string) => {
              if (selected === ANY) return "Anyone";
              if (selected === "me") return "Me";
              if (selected === "agents:me") return "My Agents";
              if (selected === "none") return "Unassigned";
              return memberById.get(selected)?.user.name ?? selected;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* Every item in a group (the group carries the padding); names as text, the group says the kind. */}
          <SelectGroup>
            <SelectItem value={ANY}>Anyone</SelectItem>
            <SelectItem value="me">Me</SelectItem>
            {sponsorsAgents ? <SelectItem value="agents:me">My Agents</SelectItem> : null}
            <SelectItem value="none">Unassigned</SelectItem>
          </SelectGroup>
          {humans.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Humans</SelectLabel>
                {humans.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.user.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
          {agents.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Agents</SelectLabel>
                {agents.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.user.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
        </SelectContent>
      </Select>

      <ToggleGroup
        value={[value.kind ?? ANY]}
        onValueChange={(next: string[]) => {
          const picked = next[0];
          onChange({ kind: picked === "human" || picked === "agent" ? picked : undefined });
        }}
        aria-label="Assigned to"
        variant="outline"
        spacing={0}
      >
        <ToggleGroupItem value={ANY} aria-label="Anyone">
          Any
        </ToggleGroupItem>
        <ToggleGroupItem value="human" aria-label="Humans">
          <User />
          Humans
        </ToggleGroupItem>
        <ToggleGroupItem value="agent" aria-label="Agents">
          <Bot />
          Agents
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup
        value={[value.open === "0" ? "all" : "open"]}
        onValueChange={(next: string[]) => onChange({ open: next[0] === "all" ? "0" : undefined })}
        aria-label="Open or closed"
        variant="outline"
        spacing={0}
      >
        <ToggleGroupItem value="open">Open</ToggleGroupItem>
        <ToggleGroupItem value="all">All</ToggleGroupItem>
      </ToggleGroup>

      <span className="flex-1" />

      {showView ? (
        <ToggleGroup
          value={[value.view ?? "list"]}
          onValueChange={(next: string[]) =>
            onChange({ view: next[0] === "board" ? "board" : undefined })
          }
          aria-label="View"
          variant="outline"
          spacing={0}
        >
          <ToggleGroupItem value="list" aria-label="List">
            <List />
          </ToggleGroupItem>
          <ToggleGroupItem value="board" aria-label="Board">
            <Kanban />
          </ToggleGroupItem>
        </ToggleGroup>
      ) : null}

      {hideGroup ? null : (
        <Select
          value={value.group ?? "state"}
          onValueChange={(next) => onChange({ group: next === "none" ? "none" : undefined })}
        >
          <SelectTrigger aria-label="Group by" className="w-36">
            <SelectValue>
              {(selected: string) => (selected === "none" ? "No grouping" : "Group by State")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="state">Group by State</SelectItem>
              <SelectItem value="none">No grouping</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
