import {
  Badge,
  Button,
  MemberChip,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@deevy/design-system";
import { ada, builder, grace, planner, suspendedAgent } from "./lib/fixtures";

const rows = [
  { member: ada, role: "admin", suspended: false },
  { member: grace, role: "member", suspended: false },
  { member: planner, role: "member", suspended: false },
  { member: builder, role: "member", suspended: false },
  { member: suspendedAgent, role: "member", suspended: true },
];

/** Settings > Members: a MemberChip, the handle, the role with an Agent badge, and the access controls. */
export const Members = () => (
  <Table aria-label="Members">
    <TableHeader>
      <TableRow>
        <TableHead>Member</TableHead>
        <TableHead>Handle</TableHead>
        <TableHead>Role</TableHead>
        <TableHead className="text-right">Access</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map(({ member, role, suspended }) => (
        <TableRow key={member.id}>
          <TableCell>
            <MemberChip member={member} />
          </TableCell>
          <TableCell className="text-muted-foreground">@{member.handle}</TableCell>
          <TableCell>
            <span className="flex items-center gap-2">
              {role}
              {member.kind === "agent" ? <Badge variant="secondary">Agent</Badge> : null}
            </span>
          </TableCell>
          <TableCell className="text-right">
            {suspended ? (
              <span className="flex items-center justify-end gap-2">
                <Badge variant="destructive">Suspended</Badge>
                <Button variant="outline" size="sm">
                  Reinstate
                </Button>
              </span>
            ) : (
              <Button variant="outline" size="sm">
                Suspend
              </Button>
            )}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const keys = [
  { name: "laptop", start: "dvy_k7f2", created: "2026-08-12", enabled: true },
  { name: "ci", start: "dvy_p9qm", created: "2026-08-20", enabled: true },
  { name: "old laptop", start: "dvy_a3xz", created: "2026-06-03", enabled: false },
];

/** An Agent's API keys: the name, the key's start in mono, and Revoke; the caption says what the list is. */
export const ApiKeys = () => (
  <Table aria-label="API keys">
    <TableCaption>Keys of Builder. A revoked key stops working at once.</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Key</TableHead>
        <TableHead>Created</TableHead>
        <TableHead className="text-right" />
      </TableRow>
    </TableHeader>
    <TableBody>
      {keys.map((key) => (
        <TableRow key={key.start}>
          <TableCell className="font-medium">{key.name}</TableCell>
          <TableCell>
            <span className="flex items-center gap-2">
              <code className="font-mono text-xs text-muted-foreground">{key.start}…</code>
              {key.enabled ? null : <Badge variant="outline">Disabled</Badge>}
            </span>
          </TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground">{key.created}</TableCell>
          <TableCell className="text-right">
            <Button variant="destructive" size="sm">
              Revoke
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const runs = [
  { agent: planner, completed: 14, failed: 1 },
  { agent: builder, completed: 23, failed: 3 },
  { agent: suspendedAgent, completed: 4, failed: 2 },
];

/** Runs per Agent this week, with the Workspace total in a footer. */
export const WithFooter = () => (
  <Table aria-label="Runs this week">
    <TableHeader>
      <TableRow>
        <TableHead>Agent</TableHead>
        <TableHead className="text-right">Completed</TableHead>
        <TableHead className="text-right">Failed</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {runs.map((row) => (
        <TableRow key={row.agent.id}>
          <TableCell>
            <MemberChip member={row.agent} size="xs" />
          </TableCell>
          <TableCell className="text-right font-mono text-xs">{row.completed}</TableCell>
          <TableCell className="text-right font-mono text-xs">{row.failed}</TableCell>
        </TableRow>
      ))}
    </TableBody>
    <TableFooter>
      <TableRow>
        <TableCell>All Agents</TableCell>
        <TableCell className="text-right font-mono text-xs">41</TableCell>
        <TableCell className="text-right font-mono text-xs">6</TableCell>
      </TableRow>
    </TableFooter>
  </Table>
);

/** The row the keyboard is on, marked with `data-state="selected"`. */
export const SelectedRow = () => (
  <Table aria-label="Issues">
    <TableHeader>
      <TableRow>
        <TableHead className="w-24">Key</TableHead>
        <TableHead>Title</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-mono text-xs text-muted-foreground">DEV-42</TableCell>
        <TableCell className="font-medium">Add ruling authority to Gate</TableCell>
      </TableRow>
      <TableRow data-state="selected">
        <TableCell className="font-mono text-xs text-muted-foreground">DEV-41</TableCell>
        <TableCell className="font-medium">Stream Events to the inbox without polling</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-mono text-xs text-muted-foreground">DEV-40</TableCell>
        <TableCell className="font-medium">Sponsor can suspend an Agent from its page</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
