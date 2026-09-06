import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  StateBadge,
} from "@deevy/design-system";
import { ChevronDown } from "lucide-react";
import { states } from "../fixtures";

/** `s` on an Issue: the Workflow's States in a Popover under the current one, open so the card shows it. */
export const StatePicker = () => (
  <div className="flex min-h-80 items-start">
    <Popover open>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <StateBadge state={states.review} />
        <ChevronDown data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command label="State">
          <CommandInput placeholder="Change State…" />
          <CommandList>
            <CommandEmpty>No State matches.</CommandEmpty>
            <CommandGroup heading="States">
              {Object.values(states).map((state) => (
                <CommandItem
                  key={state.name}
                  value={state.name}
                  data-checked={state === states.review ? "true" : undefined}
                >
                  <StateBadge state={state} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>
);

/** A header with a title and description, above plain content: what a Gate wants. */
export const WithHeader = () => (
  <div className="flex min-h-56 items-start">
    <Popover open>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        What is Review waiting for?
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>Review is a Gate</PopoverTitle>
          <PopoverDescription>
            An Issue leaves it when a Human approves the Note. Ada Lovelace and Grace Hopper can
            rule; an Agent never decides a Gate.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">
            Later
          </Button>
          <Button size="sm">Open the Note</Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);
