import { useNavigate } from "@tanstack/react-router";
import { FolderKanban, GitBranch, Inbox, Kanban, Plus, Settings } from "lucide-react";
import { useNewIssue } from "@/components/new-issue";
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
} from "@/components/ui/command";
import { useShortcutScope } from "@/lib/shortcuts";
import { settingsNav } from "@/routes/settings/layout";

export interface PaletteProject {
  key: string;
  name: string;
}

/**
 * ⌘K: everywhere in deevy by name, and the things you can make, from one box
 * (docs/plans/ui-redesign.md). Slice 1 navigates and creates; the actions on a
 * focused Issue and the search over Issues arrive with the Issues home.
 */
export function CommandPalette({
  open,
  onOpenChange,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: PaletteProject[];
}) {
  const navigate = useNavigate();
  const { open: newIssue } = useNewIssue();
  // While it is open the page behind it is quiet, so `g i` typed into the
  // search box searches instead of jumping.
  useShortcutScope("palette", open);

  // Every destination here is a route the router knows; the cast is what lets
  // one list of strings stand in for a dozen literal types.
  const goTo = (to: string) => {
    onOpenChange(false);
    void navigate({ to: to as "/" });
  };
  const goToProject = (key: string, where: "" | "/board" | "/settings/workflow") => {
    onOpenChange(false);
    if (where === "/board") void navigate({ to: "/projects/$key/board", params: { key } });
    else if (where === "/settings/workflow")
      void navigate({ to: "/projects/$key/settings/workflow", params: { key } });
    else void navigate({ to: "/projects/$key", params: { key } });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search or jump"
      description="Type where to go or what to make"
    >
      {/* This CommandDialog puts its children straight into the dialog; the cmdk root is ours to add. */}
      <Command>
        <CommandInput placeholder="Search or jump to…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Create">
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                newIssue();
              }}
            >
              <Plus />
              New Issue
              <CommandShortcut>c</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => goTo("/inbox")}>
              <Inbox />
              Inbox
              <CommandShortcut>g i</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => goTo("/")}>
              <FolderKanban />
              Projects
              <CommandShortcut>g p</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => goTo("/settings/workspace")}>
              <Settings />
              Settings
              <CommandShortcut>g s</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          {projects.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Projects">
                {projects.map((project) => (
                  <CommandItem
                    key={project.key}
                    value={`${project.key} ${project.name}`}
                    onSelect={() => goToProject(project.key, "")}
                  >
                    <FolderKanban />
                    <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
                    {project.name}
                  </CommandItem>
                ))}
                {projects.map((project) => (
                  <CommandItem
                    key={`${project.key}-board`}
                    value={`${project.key} ${project.name} Board`}
                    onSelect={() => goToProject(project.key, "/board")}
                  >
                    <Kanban />
                    <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
                    Board
                  </CommandItem>
                ))}
                {projects.map((project) => (
                  <CommandItem
                    key={`${project.key}-workflow`}
                    value={`${project.key} ${project.name} Workflow`}
                    onSelect={() => goToProject(project.key, "/settings/workflow")}
                  >
                    <GitBranch />
                    <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
                    Workflow
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
          <CommandSeparator />
          <CommandGroup heading="Settings">
            {settingsNav.flatMap(({ group, pages }) =>
              pages.map((page) => (
                <CommandItem
                  key={page.to}
                  value={`${group} ${page.label} settings`}
                  onSelect={() => goTo(page.to)}
                >
                  <Settings />
                  {page.label}
                  <span className="ml-auto text-xs text-muted-foreground">{group}</span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
