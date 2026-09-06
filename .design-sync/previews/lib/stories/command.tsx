import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@deevy/design-system";
import { CircleUser, Copy, Inbox, Link2, ListTodo, Maximize2, Plus, Settings } from "lucide-react";

/** ⌘K: the Issue in front of you, what you can make, and everywhere by name, from one box. Open so the card shows it. */
export const Palette = () => (
  <CommandDialog
    open
    title="Search or jump"
    description="Type an Issue, where to go, or what to make"
  >
    <Command label="Search or jump">
      <CommandInput placeholder="Search Issues, or jump to…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="DEV-42">
          <CommandItem value="DEV-42 open full page">
            <Maximize2 />
            Open full page
            <CommandShortcut>o</CommandShortcut>
          </CommandItem>
          <CommandItem value="DEV-42 copy key">
            <Copy />
            Copy key
          </CommandItem>
          <CommandItem value="DEV-42 copy link">
            <Link2 />
            Copy link
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Create">
          <CommandItem value="new issue">
            <Plus />
            New Issue
            <CommandShortcut>c</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          <CommandItem value="inbox">
            <Inbox />
            Inbox
            <CommandShortcut>g i</CommandShortcut>
          </CommandItem>
          <CommandItem value="my issues">
            <CircleUser />
            My Issues
            <CommandShortcut>g m</CommandShortcut>
          </CommandItem>
          <CommandItem value="all issues">
            <ListTodo />
            All Issues
            <CommandShortcut>g a</CommandShortcut>
          </CommandItem>
          <CommandItem value="settings">
            <Settings />
            Settings
            <CommandShortcut>g s</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </CommandDialog>
);
