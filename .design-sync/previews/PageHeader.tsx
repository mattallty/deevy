import { Button, PageHeader, StateBadge, ToggleGroup, ToggleGroupItem } from "@deevy/design-system";
import { Plus } from "lucide-react";
import { states } from "./lib/fixtures";

export const WithActions = () => (
  <PageHeader
    title="All Issues"
    description="Every Issue in the Workspace, newest change first."
    actions={
      <Button>
        <Plus data-icon="inline-start" /> New Issue
      </Button>
    }
  />
);

/** A row under the title: a strip of States, a view toggle. */
export const WithChildren = () => (
  <PageHeader title="DEV" description="The product, from intent to shipped.">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4">
        {Object.values(states).map((state) => (
          <StateBadge key={state.name} state={state} />
        ))}
      </div>
      <ToggleGroup defaultValue={["list"]} variant="outline" spacing={0}>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
        <ToggleGroupItem value="board">Board</ToggleGroupItem>
      </ToggleGroup>
    </div>
  </PageHeader>
);

export const TitleOnly = () => <PageHeader title="Inbox" />;
