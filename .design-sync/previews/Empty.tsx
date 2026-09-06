import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deevy/design-system";
import { ClipboardList, Inbox, SearchX } from "lucide-react";

/** The words say what emptied the list, and the action undoes it. */
export const NoMatch = () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <SearchX aria-hidden />
      </EmptyMedia>
      <EmptyTitle>No Issues match your filters</EmptyTitle>
      <EmptyDescription>Clear a filter, or widen the view.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button variant="outline" size="sm">
        Clear filters
      </Button>
    </EmptyContent>
  </Empty>
);

export const NothingAssigned = () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <ClipboardList aria-hidden />
      </EmptyMedia>
      <EmptyTitle>Nothing assigned to you</EmptyTitle>
      <EmptyDescription>
        Issues assigned to you, or to an Agent you sponsor, show up here.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

export const NoOpenIssues = () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <ClipboardList aria-hidden />
      </EmptyMedia>
      <EmptyTitle>No open Issues</EmptyTitle>
      <EmptyDescription>
        Everything in DEV is done. Create an Issue to start something.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button size="sm">New Issue</Button>
    </EmptyContent>
  </Empty>
);

/** The inbox under its Unread filter, with the way back to All. */
export const NothingUnread = () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Inbox aria-hidden />
      </EmptyMedia>
      <EmptyTitle>Nothing unread</EmptyTitle>
      <EmptyDescription>You are caught up. All shows what you have read.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button variant="outline" size="sm">
        Show All
      </Button>
    </EmptyContent>
  </Empty>
);
