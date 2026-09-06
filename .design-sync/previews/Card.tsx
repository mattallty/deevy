import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Markdown,
  MemberChip,
  RunStatus,
} from "@deevy/design-system";
import { ada, builder, planner } from "./lib/fixtures";

const summary = `Moved **DEV-41** to Review and opened a pull request.

- Replaced the poll with the SSE Event stream
- Added a test for the reconnect path`;

/** A Run: what the Agent did on an Issue, its status in the corner, and the Agent who ran it. */
export const Run = () => (
  <Card className="max-w-md">
    <CardHeader>
      <CardTitle>Run on DEV-41</CardTitle>
      <CardDescription>Started 2h ago · finished in 14 min</CardDescription>
      <CardAction>
        <RunStatus status="completed" />
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <MemberChip member={builder} size="sm" sponsorName="Ada Lovelace" />
      <Markdown>{summary}</Markdown>
    </CardContent>
    <CardFooter className="justify-between border-t">
      <span className="font-mono text-xs text-muted-foreground">run_9k2m4x7p1q0z</span>
      <Button variant="ghost" size="sm">
        Open Run
      </Button>
    </CardFooter>
  </Card>
);

/** A Run still going, with a Gate waiting on a Human. */
export const RunAwaitingInput = () => (
  <Card className="max-w-md">
    <CardHeader>
      <CardTitle>Run on DEV-42</CardTitle>
      <CardDescription>Started 20 min ago</CardDescription>
      <CardAction>
        <RunStatus status="awaiting_input" label="Waiting for approval" />
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <MemberChip member={planner} size="sm" sponsorName="Ada Lovelace" />
      <Markdown>
        {
          "Drafted the spec for *ruling authority* on a Gate. Needs a Human to approve before I touch the schema."
        }
      </Markdown>
    </CardContent>
    <CardFooter className="gap-2 border-t">
      <Button size="sm">Approve</Button>
      <Button variant="outline" size="sm">
        Send back
      </Button>
    </CardFooter>
  </Card>
);

/** A Channel: where the Workspace's Events go out, and whether it is reachable. */
export const Channel = () => (
  <Card className="max-w-md">
    <CardHeader>
      <CardTitle>#deevy-runs</CardTitle>
      <CardDescription>Slack · Runs, Gates and mentions</CardDescription>
      <CardAction>
        <Badge variant="secondary">Connected</Badge>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-1">
      <span>Last delivery 4 min ago, from a Run by Builder.</span>
      <span className="text-muted-foreground">Set up by</span>
      <MemberChip member={ada} size="xs" />
    </CardContent>
    <CardFooter className="gap-2">
      <Button variant="outline" size="sm">
        Send a test
      </Button>
      <Button variant="ghost" size="sm">
        Disconnect
      </Button>
    </CardFooter>
  </Card>
);

/** `size="sm"`: tighter spacing for a card in a list of cards. */
export const Small = () => (
  <Card size="sm" className="max-w-sm">
    <CardHeader>
      <CardTitle>Run on DEV-40</CardTitle>
      <CardDescription>1d ago · failed after 3 min</CardDescription>
      <CardAction>
        <RunStatus status="failed" />
      </CardAction>
    </CardHeader>
    <CardContent>
      <Markdown>{"The migration check failed: `member.suspended_at` is not `NOT NULL`."}</Markdown>
    </CardContent>
  </Card>
);
