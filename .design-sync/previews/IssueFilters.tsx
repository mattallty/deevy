import { IssueFilters } from "@deevy/design-system";
import { useState } from "react";
import { members, states } from "./lib/fixtures";

type Search = Parameters<typeof IssueFilters>[0]["value"];

const projects = [
  { key: "DEV", name: "deevy" },
  { key: "DOCS", name: "Docs" },
];
const allStates = Object.values(states);

const useSearch = (initial: Search) => {
  const [value, setValue] = useState<Search>(initial);
  const onChange = (patch: Partial<Search>) => setValue((prev) => ({ ...prev, ...patch }));
  return { value, onChange };
};

/** The bar above the Workspace's Issues: a Project and a State set, Agents' Issues only. */
export const Filtered = () => {
  const { value, onChange } = useSearch({ project: "DEV", state: "Review", kind: "agent" });
  return (
    <IssueFilters
      value={value}
      onChange={onChange}
      projects={projects}
      states={allStates}
      members={members}
      sponsorsAgents
    />
  );
};

/** With List / Board on offer, on the Board, showing closed Issues too. */
export const WithView = () => {
  const { value, onChange } = useSearch({ assignee: "agents:me", open: "0", view: "board" });
  return (
    <IssueFilters
      value={value}
      onChange={onChange}
      projects={projects}
      states={allStates}
      members={members}
      sponsorsAgents
      showView
    />
  );
};

/** Inside a Project's Board: the Project is given and the rows are already grouped. */
export const OnAProjectBoard = () => {
  const { value, onChange } = useSearch({ assignee: "me" });
  return (
    <IssueFilters
      value={value}
      onChange={onChange}
      projects={projects}
      states={allStates}
      members={members}
      sponsorsAgents={false}
      hideProject
      hideGroup
    />
  );
};
