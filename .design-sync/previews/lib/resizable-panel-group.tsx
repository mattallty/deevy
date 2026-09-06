// The stories for ResizablePanelGroup and its parts. Kept under lib/ with a non-component
// file name: a sibling named like an export is shimmed to the package by the
// story-imports plugin, so `export * from "./ResizablePanelGroup"` would re-export all of it.
import {
  LabelBadge,
  Markdown,
  MemberChip,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  StateBadge,
} from "@deevy/design-system";
import { ada, issues, labels, planner, states } from "./fixtures";

const issue = issues[0]!;

const spec = `## Why

A Gate needs to say who may decide it. Today any Human can approve or reject, which is not what a Sponsor signed up for.

## What

- Add \`rulingAuthority\` to the Gate: \`any-human\` or a list of Member ids.
- The Board's Decide button is only offered to those Members.`;

/** The Issue page: the Document in the main panel, the properties rail at 300px, a handle between. */
export const IssuePage = () => (
  <div className="h-80 w-full">
    <ResizablePanelGroup orientation="horizontal" className="rounded-md border bg-background">
      <ResizablePanel minSize={240} className="min-w-0">
        <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
            <StateBadge state={issue.state} size="sm" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{issue.title}</h2>
          <Markdown>{spec}</Markdown>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={300} minSize={220} className="min-w-0">
        <dl className="flex h-full flex-col gap-3 bg-muted/30 p-4 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">State</dt>
            <dd>
              <StateBadge state={issue.state} />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Assignee</dt>
            <dd>
              <MemberChip member={ada} size="sm" />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Approver</dt>
            <dd>
              <MemberChip member={planner} size="sm" sponsorName="Ada Lovelace" />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Labels</dt>
            <dd className="flex flex-wrap gap-1">
              <LabelBadge label={labels.epic} />
              <LabelBadge label={labels.backend} />
            </dd>
          </div>
        </dl>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
);

/** Stacked: the Run's log above, its Document below; the handle is a horizontal bar. */
export const Vertical = () => (
  <div className="h-72 w-full">
    <ResizablePanelGroup orientation="vertical" className="rounded-md border bg-background">
      <ResizablePanel defaultSize={110} minSize={60} className="min-h-0">
        <ol className="flex h-full flex-col gap-1 overflow-hidden p-3 font-mono text-xs text-muted-foreground">
          <li>10:02:14 run_7f3k2 started by planner</li>
          <li>10:02:15 read DEV-42 and its Spec</li>
          <li>10:02:41 wrote Document "Spec"</li>
          <li className="text-foreground">10:02:42 moved to Review — waiting on the Gate</li>
        </ol>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel minSize={80} className="min-h-0">
        <div className="h-full overflow-hidden p-3">
          <Markdown>{spec}</Markdown>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
);

/** Without the grip: a plain hairline, still draggable. */
export const PlainHandle = () => (
  <div className="h-40 w-full">
    <ResizablePanelGroup orientation="horizontal" className="rounded-md border bg-background">
      <ResizablePanel className="min-w-0">
        <div className="flex h-full flex-col gap-1 p-3 text-sm">
          <span className="text-xs text-muted-foreground">Inbox</span>
          {issues.slice(0, 3).map((row) => (
            <span key={row.key} className="truncate">
              <span className="mr-2 font-mono text-xs text-muted-foreground">{row.key}</span>
              {row.title}
            </span>
          ))}
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel className="min-w-0">
        <div className="flex h-full flex-col gap-2 p-3 text-sm">
          <span className="text-xs text-muted-foreground">Preview</span>
          <span className="font-medium">{issues[1]!.title}</span>
          <StateBadge state={states.inProgress} size="sm" />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
);
