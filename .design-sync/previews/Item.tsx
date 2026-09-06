import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  MemberChip,
  RunStatus,
} from "@deevy/design-system";
import { ada, builder, grace, planner } from "./lib/fixtures";

const Unread = () => <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gate" />;

/** One inbox row: who did what on which Issue, the Issue's title under it, and Mark read beside it. */
export const InboxRow = () => (
  <Item variant="outline" className="max-w-lg">
    <ItemMedia>
      <MemberChip member={builder} avatarOnly size="md" />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>
        Builder finished a Run on <span className="font-mono text-xs">DEV-41</span>
      </ItemTitle>
      <ItemDescription>Stream Events to the inbox without polling</ItemDescription>
    </ItemContent>
    <ItemActions>
      <span className="font-mono text-xs text-muted-foreground">2h</span>
      <Unread />
      <Button variant="ghost" size="xs">
        Mark read
      </Button>
    </ItemActions>
  </Item>
);

/** The inbox: rows in an ItemGroup, a separator between days. */
export const Inbox = () => (
  <ItemGroup className="max-w-lg">
    <Item variant="outline">
      <ItemMedia>
        <MemberChip member={ada} avatarOnly size="md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          Ada Lovelace mentioned you on <span className="font-mono text-xs">DEV-42</span>
        </ItemTitle>
        <ItemDescription>
          “@grace can you rule on the Gate before the schema lands?”
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span className="font-mono text-xs text-muted-foreground">35m</span>
        <Unread />
        <Button variant="ghost" size="xs">
          Mark read
        </Button>
      </ItemActions>
    </Item>
    <Item variant="outline">
      <ItemMedia>
        <MemberChip member={planner} avatarOnly size="md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          Planner assigned you <span className="font-mono text-xs">DEV-39</span>
        </ItemTitle>
        <ItemDescription>Issue key is not monospace in the side peek</ItemDescription>
      </ItemContent>
      <ItemActions>
        <span className="font-mono text-xs text-muted-foreground">4h</span>
        <Unread />
        <Button variant="ghost" size="xs">
          Mark read
        </Button>
      </ItemActions>
    </Item>
    <ItemSeparator />
    <Item variant="outline">
      <ItemMedia>
        <MemberChip member={builder} avatarOnly size="md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          Builder failed a Run on <span className="font-mono text-xs">DEV-40</span>
        </ItemTitle>
        <ItemDescription>
          “The migration check failed: member.suspended_at is not NOT NULL.”
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span className="font-mono text-xs text-muted-foreground">1d</span>
      </ItemActions>
    </Item>
  </ItemGroup>
);

/** The three looks: default sits flat, outline has a border, muted a tint. */
export const Variants = () => (
  <div className="flex max-w-lg flex-col gap-2">
    <Item variant="default">
      <ItemMedia>
        <MemberChip member={grace} avatarOnly size="md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Grace Hopper approved the Gate on DEV-37</ItemTitle>
        <ItemDescription>default</ItemDescription>
      </ItemContent>
    </Item>
    <Item variant="outline">
      <ItemMedia>
        <MemberChip member={grace} avatarOnly size="md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Grace Hopper approved the Gate on DEV-37</ItemTitle>
        <ItemDescription>outline</ItemDescription>
      </ItemContent>
    </Item>
    <Item variant="muted">
      <ItemMedia>
        <MemberChip member={grace} avatarOnly size="md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Grace Hopper approved the Gate on DEV-37</ItemTitle>
        <ItemDescription>muted</ItemDescription>
      </ItemContent>
    </Item>
  </div>
);

/** A Run as an Item, with a header line and a footer line spanning the row. */
export const WithHeaderAndFooter = () => (
  <Item variant="outline" className="max-w-lg">
    <ItemHeader>
      <span className="font-mono text-xs text-muted-foreground">run_9k2m4x7p1q0z</span>
      <RunStatus status="active" />
    </ItemHeader>
    <ItemMedia>
      <MemberChip member={builder} avatarOnly size="md" />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>Builder is working on DEV-41</ItemTitle>
      <ItemDescription>
        Replacing the poll with the SSE Event stream; a test for the reconnect path is next.
      </ItemDescription>
    </ItemContent>
    <ItemActions>
      <Button variant="outline" size="xs">
        Stop
      </Button>
    </ItemActions>
    <ItemFooter>
      <span className="text-muted-foreground">Started 6 min ago</span>
      <span className="text-muted-foreground">Sponsored by Ada Lovelace</span>
    </ItemFooter>
  </Item>
);
