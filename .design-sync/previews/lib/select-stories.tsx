import {
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@deevy/design-system";
import { ada, builder, grace, planner } from "./fixtures";

const humans = [ada, grace];
const agents = [planner, builder];
const ANY = "__any";

const assigneeName = (selected: string) => {
  if (selected === ANY) return "Anyone";
  if (selected === "me") return "Me";
  if (selected === "agents:me") return "My Agents";
  if (selected === "none") return "Unassigned";
  return [...humans, ...agents].find((member) => member.id === selected)?.user.name ?? selected;
};

/** The Assignee filter's list: the shortcuts, then Members as names under Humans / Agents. */
const AssigneeItems = () => (
  <>
    <SelectGroup>
      <SelectItem value={ANY}>Anyone</SelectItem>
      <SelectItem value="me">Me</SelectItem>
      <SelectItem value="agents:me">My Agents</SelectItem>
      <SelectItem value="none">Unassigned</SelectItem>
    </SelectGroup>
    <SelectSeparator />
    <SelectGroup>
      <SelectLabel>Humans</SelectLabel>
      {humans.map((member) => (
        <SelectItem key={member.id} value={member.id}>
          {member.user.name}
        </SelectItem>
      ))}
    </SelectGroup>
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
);

/** The Assignee filter with a Human chosen, closed. */
export const Assignee = () => (
  <Select defaultValue={ada.id}>
    <SelectTrigger aria-label="Assignee" className="w-44">
      <SelectValue>{assigneeName}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <AssigneeItems />
    </SelectContent>
  </Select>
);

/** The same Select open: groups labelled Humans / Agents, separators between, the chosen item ticked. */
export const Open = () => (
  <div className="flex h-96 flex-col">
    <Select defaultValue={ada.id} defaultOpen>
      <SelectTrigger aria-label="Assignee" className="w-44">
        <SelectValue>{assigneeName}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <AssigneeItems />
      </SelectContent>
    </Select>
  </div>
);

/** With a Label, as the Workflow editor asks what a State counts as. */
export const WithLabel = () => (
  <div className="flex flex-col gap-2">
    <Label htmlFor="state-category">Counts as</Label>
    <Select defaultValue="active">
      <SelectTrigger id="state-category" className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="backlog">backlog</SelectItem>
          <SelectItem value="active">active</SelectItem>
          <SelectItem value="done">done</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

/** The two trigger heights: `sm` for a toolbar, `default` for a form. */
export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Select defaultValue="state">
      <SelectTrigger size="sm" aria-label="Group by" className="w-36">
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
    <Select defaultValue="state">
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
  </div>
);

/** Nothing chosen yet (the placeholder), and a Select that cannot be changed. */
export const PlaceholderAndDisabled = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Select>
      <SelectTrigger aria-label="Project" className="w-40">
        <SelectValue placeholder="Choose a Project" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="DEV">deevy</SelectItem>
          <SelectItem value="DOCS">Docs</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <Select defaultValue="DEV" disabled>
      <SelectTrigger aria-label="Project" className="w-40">
        <SelectValue>{(selected: string) => (selected === "DEV" ? "deevy" : "Docs")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="DEV">deevy</SelectItem>
          <SelectItem value="DOCS">Docs</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);
