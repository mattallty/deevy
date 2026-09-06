import { ToggleGroup, ToggleGroupItem } from "@deevy/design-system";
import { Bot, Kanban, List, User } from "lucide-react";

/** The Issues filter bar's joined toggles: who it is assigned to, one of three pressed. */
export const AssignedTo = () => (
  <ToggleGroup defaultValue={["human"]} aria-label="Assigned to" variant="outline" spacing={0}>
    <ToggleGroupItem value="any" aria-label="Anyone">
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
);

/** Open Issues, or every Issue. */
export const OpenOrAll = () => (
  <ToggleGroup defaultValue={["open"]} aria-label="Open or closed" variant="outline" spacing={0}>
    <ToggleGroupItem value="open">Open</ToggleGroupItem>
    <ToggleGroupItem value="all">All</ToggleGroupItem>
  </ToggleGroup>
);

/** Icon only: the list, or the board. */
export const ListOrBoard = () => (
  <ToggleGroup defaultValue={["board"]} aria-label="View" variant="outline" spacing={0}>
    <ToggleGroupItem value="list" aria-label="List">
      <List />
    </ToggleGroupItem>
    <ToggleGroupItem value="board" aria-label="Board">
      <Kanban />
    </ToggleGroupItem>
  </ToggleGroup>
);

/** Small, in a page header: the Inbox's All / Unread. */
export const Small = () => (
  <ToggleGroup defaultValue={["unread"]} aria-label="Show" variant="outline" size="sm" spacing={0}>
    <ToggleGroupItem value="all">All</ToggleGroupItem>
    <ToggleGroupItem value="unread">Unread</ToggleGroupItem>
  </ToggleGroup>
);

/** Spaced and borderless, the default: for a set that is not one control. */
export const Spaced = () => (
  <ToggleGroup defaultValue={["comments"]} aria-label="Show">
    <ToggleGroupItem value="all">All</ToggleGroupItem>
    <ToggleGroupItem value="comments">Comments</ToggleGroupItem>
    <ToggleGroupItem value="changes">Changes</ToggleGroupItem>
  </ToggleGroup>
);

/** Nothing to choose while the list loads. */
export const Disabled = () => (
  <ToggleGroup
    defaultValue={["open"]}
    aria-label="Open or closed"
    variant="outline"
    spacing={0}
    disabled
  >
    <ToggleGroupItem value="open">Open</ToggleGroupItem>
    <ToggleGroupItem value="all">All</ToggleGroupItem>
  </ToggleGroup>
);
