import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  MemberChip,
  StateBadge,
} from "@deevy/design-system";
import { ChevronsUpDown, Keyboard, LogOut, Monitor, Moon, MoreHorizontal, Sun } from "lucide-react";
import { ada, labels, states } from "../fixtures";

/** The Member menu at the foot of the sidebar: who you are, the theme, the way out. Open so the card shows it. */
export const MemberMenu = () => (
  <div className="flex min-h-80 items-start">
    <DropdownMenu open>
      <DropdownMenuTrigger render={<Button variant="ghost" className="w-56 justify-start" />}>
        <MemberChip member={ada} size="md" className="min-w-0 flex-1" />
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span>Ada Lovelace</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">@ada</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value="system">
            <DropdownMenuRadioItem value="system">
              <Monitor />
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon />
              Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Keyboard />
          Keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

/** An Issue's row menu: Labels as checkboxes, the State in a submenu (open too), and the one destructive item last. */
export const IssueMenu = () => (
  <div className="flex min-h-80 items-start">
    <DropdownMenu open>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="More for DEV-42" />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono">DEV-42</DropdownMenuLabel>
          <DropdownMenuItem>
            Copy key
            <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Open full page
            <DropdownMenuShortcut>O</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Labels</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>{labels.epic.name}</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>{labels.backend.name}</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>{labels.docs.name}</DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {Object.values(states).map((state) => (
              <DropdownMenuItem key={state.name}>
                <StateBadge state={state} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete Issue</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
