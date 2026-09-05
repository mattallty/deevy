import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CircleUser,
  FolderKanban,
  GitBranch,
  Inbox,
  Kanban,
  ListTodo,
  Plus,
  Settings,
} from "lucide-react";
import { useState } from "react";
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
import { orpc } from "@/lib/orpc";
import { useShortcutScope } from "@/lib/shortcuts";
import { settingsNav } from "@/routes/settings/layout";

export interface PaletteProject {
  key: string;
  name: string;
}

/**
 * ⌘K: everywhere in deevy by name, the things you can make, and any Issue by
 * key or title, from one box (docs/plans/ui-redesign.md). Issues come from
 * `issues.list`'s `q`, one query per keystroke past the first; the actions on
 * a focused Issue arrive with the Issue panel.
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

  // Two characters is a search; one is a shortcut hint being typed.
  const [query, setQuery] = useState("");
  const searching = query.trim().length >= 2;
  const found = useQuery({
    ...orpc.issues.list.queryOptions({ input: { q: query.trim(), limit: 8 } }),
    enabled: open && searching,
  });

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };
  // Every destination here is a route the router knows; the cast is what lets
  // one list of strings stand in for a dozen literal types.
  const goTo = (to: string) => {
    close();
    void navigate({ to: to as "/" });
  };
  const goToProject = (key: string, where: "" | "/board" | "/settings/workflow") => {
    close();
    if (where === "/board") void navigate({ to: "/projects/$key/board", params: { key } });
    else if (where === "/settings/workflow")
      void navigate({ to: "/projects/$key/settings/workflow", params: { key } });
    else void navigate({ to: "/projects/$key", params: { key } });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Search or jump"
      description="Type an Issue, where to go, or what to make"
    >
      {/* This CommandDialog puts its children straight into the dialog; the cmdk root is ours to add. */}
      <Command>
        <CommandInput
          placeholder="Search Issues, or jump to…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {searching && found.isPending ? "Searching…" : "Nothing matches."}
          </CommandEmpty>
          {searching && found.data && found.data.issues.length > 0 ? (
            <CommandGroup heading="Issues">
              {found.data.issues.map((issue) => (
                <CommandItem
                  key={issue.key}
                  value={`${issue.key} ${issue.title}`}
                  onSelect={() => {
                    close();
                    void navigate({ to: "/issues/$issueKey", params: { issueKey: issue.key } });
                  }}
                >
                  <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
                  <span className="truncate">{issue.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{issue.state.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Create">
            <CommandItem
              onSelect={() => {
                close();
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
            <CommandItem
              onSelect={() => {
                close();
                void navigate({ to: "/", search: { assignee: "me" } });
              }}
            >
              <CircleUser />
              My Issues
              <CommandShortcut>g m</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                close();
                void navigate({ to: "/", search: {} });
              }}
            >
              <ListTodo />
              All Issues
              <CommandShortcut>g a</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => goTo("/projects")}>
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
