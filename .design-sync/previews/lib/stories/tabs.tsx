import { Tabs, TabsContent, TabsList, TabsTrigger } from "@deevy/design-system";

/** An Issue's Documents: one tab per Document, the current one's text below. */
export const Documents = () => (
  <Tabs defaultValue="Spec">
    <TabsList aria-label="Documents">
      <TabsTrigger value="Spec">Spec</TabsTrigger>
      <TabsTrigger value="Plan">Plan</TabsTrigger>
      <TabsTrigger value="Review">Review</TabsTrigger>
    </TabsList>
    <TabsContent value="Spec">
      <p className="max-w-prose text-sm text-muted-foreground">
        A Gate names the Human who rules on it. The Run that reaches the Gate waits until that Human
        approves or sends the Issue back.
      </p>
    </TabsContent>
    <TabsContent value="Plan">
      <p className="text-sm text-muted-foreground">Planner writes the Plan on entering Todo.</p>
    </TabsContent>
    <TabsContent value="Review">
      <p className="text-sm text-muted-foreground">
        Nothing yet: the Issue has not reached Review.
      </p>
    </TabsContent>
  </Tabs>
);

/** The editor's view switch, small, in the toolbar of a Document. */
export const EditorView = () => (
  <div className="rounded-md border bg-card">
    <div className="flex items-center justify-end border-b px-1 py-1">
      <Tabs defaultValue="edit">
        <TabsList aria-label="Editor view" className="h-7">
          <TabsTrigger value="edit" className="text-xs">
            Edit
          </TabsTrigger>
          <TabsTrigger value="source" className="text-xs">
            Source
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
    <p className="px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
      ## Ruling authority{"\n"}A Gate names the Human who rules on it.
    </p>
  </div>
);

/** The line variant: an underline instead of a filled pill. */
export const Line = () => (
  <Tabs defaultValue="board">
    <TabsList variant="line" aria-label="Project">
      <TabsTrigger value="board">Board</TabsTrigger>
      <TabsTrigger value="workflow">Workflow</TabsTrigger>
      <TabsTrigger value="settings">Settings</TabsTrigger>
    </TabsList>
    <TabsContent value="board">
      <p className="text-sm text-muted-foreground">Issues by State, one column each.</p>
    </TabsContent>
  </Tabs>
);

/** Stacked, for a Settings nav: the active tab's mark sits on its right edge. */
export const Vertical = () => (
  <Tabs defaultValue="agents" orientation="vertical" className="w-64">
    <TabsList variant="line" aria-label="Settings">
      <TabsTrigger value="workspace">Workspace</TabsTrigger>
      <TabsTrigger value="members">Members</TabsTrigger>
      <TabsTrigger value="agents">Agents</TabsTrigger>
      <TabsTrigger value="labels">Labels</TabsTrigger>
    </TabsList>
    <TabsContent value="agents">
      <p className="text-sm text-muted-foreground">Two Agents, both sponsored by Ada.</p>
    </TabsContent>
  </Tabs>
);

/** A Document that is not there yet cannot be opened. */
export const Disabled = () => (
  <Tabs defaultValue="Spec">
    <TabsList aria-label="Documents">
      <TabsTrigger value="Spec">Spec</TabsTrigger>
      <TabsTrigger value="Plan">Plan</TabsTrigger>
      <TabsTrigger value="Review" disabled>
        Review
      </TabsTrigger>
    </TabsList>
  </Tabs>
);
