import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CornerLeftUp, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { orpc } from "@/lib/orpc";
import { PAGE_SCOPE, useShortcut } from "@/lib/shortcuts";
import { RailHeading } from "@/components/rail-heading";

/**
 * The Issue's parent, and the way to change it: a Popover with the Project's
 * Issues searched through `issues.list`'s `q`, opened by `p`
 * (docs/plans/ui-redesign.md, "Keyboard"). The core refuses a parent from
 * another Project or a cycle; that message is shown, not pre-empted.
 */
export function ParentPicker({
  issueKey,
  projectKey,
  parent,
  shortcutScope = PAGE_SCOPE,
}: {
  issueKey: string;
  projectKey: string;
  parent: { key: string; title: string } | null;
  shortcutScope?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useShortcut("p", () => setOpen(true), { scope: shortcutScope });

  // `q` must be a character or more; an empty box lists the Project's newest.
  const search = q.trim();
  const candidates = useQuery({
    ...orpc.issues.list.queryOptions({
      input: { projectKey, limit: 20, ...(search ? { q: search } : {}) },
    }),
    enabled: open,
  });
  const update = useMutation(
    orpc.issues.update.mutationOptions({
      onSuccess: async () => {
        setOpen(false);
        setQ("");
        await queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
      },
    }),
  );

  return (
    <section className="flex flex-col gap-2">
      <RailHeading>Parent</RailHeading>
      <div className="flex items-center gap-2 text-sm">
        {parent ? (
          <Link
            to="/issues/$issueKey"
            params={{ issueKey: parent.key }}
            className="flex min-w-0 items-center gap-2 hover:underline"
          >
            <span className="font-mono text-xs text-muted-foreground">{parent.key}</span>
            <span className="truncate">{parent.title}</span>
          </Link>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="ml-auto shrink-0" />}
          >
            <CornerLeftUp />
            {parent ? "Change" : "Set parent"}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            {/* cmdk names its input from this label; an aria-label on the input would lose. */}
            <Command label="Parent" shouldFilter={false}>
              <CommandInput
                placeholder={`An Issue in ${projectKey}…`}
                value={q}
                onValueChange={setQ}
              />
              <CommandList>
                <CommandEmpty>
                  {candidates.isPending
                    ? "Searching…"
                    : candidates.isError
                      ? `Could not search: ${candidates.error.message}`
                      : "No Issue matches."}
                </CommandEmpty>
                {parent ? (
                  <CommandGroup>
                    <CommandItem
                      value="no parent"
                      onSelect={() => update.mutate({ key: issueKey, parentKey: null })}
                    >
                      <X />
                      No parent
                    </CommandItem>
                  </CommandGroup>
                ) : null}
                <CommandGroup heading={projectKey}>
                  {(candidates.data?.issues ?? [])
                    .filter((issue) => issue.key !== issueKey)
                    .map((issue) => (
                      <CommandItem
                        key={issue.key}
                        value={issue.key}
                        onSelect={() => update.mutate({ key: issueKey, parentKey: issue.key })}
                      >
                        <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
                        <span className="truncate">{issue.title}</span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
            {update.error ? (
              <p className="px-3 pb-2 text-xs text-destructive">{update.error.message}</p>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
