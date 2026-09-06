import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  StateBadge,
} from "@deevy/design-system";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { states } from "../fixtures";

/** Two actions on one thing, joined: the Workflow editor's Move up / Move down for a State. */
export const Reorder = () => (
  <div className="flex w-80 items-center gap-2 rounded-md border bg-card px-3 py-2">
    <StateBadge state={states.review} size="md" />
    <span className="font-mono text-xs text-muted-foreground">Step 4</span>
    <span className="flex-1" />
    <ButtonGroup aria-label="Reorder Review">
      <Button variant="outline" size="icon" aria-label="Move Review up">
        <ArrowUp />
      </Button>
      <Button variant="outline" size="icon" aria-label="Move Review down">
        <ArrowDown />
      </Button>
    </ButtonGroup>
  </div>
);

/** The first State cannot move up; the last cannot move down. */
export const AtTheEnds = () => (
  <div className="flex flex-wrap items-center gap-6">
    <ButtonGroup aria-label="Reorder Backlog">
      <Button variant="outline" size="icon" aria-label="Move Backlog up" disabled>
        <ArrowUp />
      </Button>
      <Button variant="outline" size="icon" aria-label="Move Backlog down">
        <ArrowDown />
      </Button>
    </ButtonGroup>
    <ButtonGroup aria-label="Reorder Done">
      <Button variant="outline" size="icon" aria-label="Move Done up">
        <ArrowUp />
      </Button>
      <Button variant="outline" size="icon" aria-label="Move Done down" disabled>
        <ArrowDown />
      </Button>
    </ButtonGroup>
  </div>
);

/** A label inside the group: the text is joined to the buttons it describes. */
export const WithText = () => (
  <ButtonGroup aria-label="Step">
    <ButtonGroupText>Step 4 of 5</ButtonGroupText>
    <Button variant="outline" size="icon" aria-label="Move up">
      <ArrowUp />
    </Button>
    <Button variant="outline" size="icon" aria-label="Move down">
      <ArrowDown />
    </Button>
  </ButtonGroup>
);

/** A split button: the ruling, and a menu of the other rulings behind a separator. */
export const WithSeparator = () => (
  <ButtonGroup aria-label="Rule on the Gate">
    <Button>Approve</Button>
    <ButtonGroupSeparator />
    <Button size="icon" aria-label="Other rulings">
      <ChevronDown />
    </Button>
  </ButtonGroup>
);

/** Stacked, where the row has no room. */
export const Vertical = () => (
  <ButtonGroup orientation="vertical" aria-label="Reorder Review">
    <Button variant="outline" size="icon" aria-label="Move Review up">
      <ArrowUp />
    </Button>
    <Button variant="outline" size="icon" aria-label="Move Review down">
      <ArrowDown />
    </Button>
  </ButtonGroup>
);
