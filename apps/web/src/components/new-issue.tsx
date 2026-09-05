import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Shortcut } from "@/components/kbd-hint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/lib/orpc";
import { useShortcut, useShortcutScope } from "@/lib/shortcuts";
import { OptionsSelect } from "@/components/options-select";

/**
 * Creating an Issue, from wherever the Human happens to be.
 *
 * It used to be reachable one way only: navigate to a Project, then find the
 * form at the top of its Issue list. The first Human to walk
 * docs/m3-acceptance.md against a deployed instance could not find it at all,
 * which is the kind of thing no test notices and every reader of the runbook
 * would have hit. The Project-page form stays — it is the right thing when you
 * are already looking at a Project and know the answer — and this is the one
 * that does not ask you to go somewhere first.
 *
 * The dialog is owned by a provider in the shell, so the sidebar button, the
 * command palette and the `c` shortcut all open the same one.
 */
const NewIssueContext = createContext<{ open: () => void } | null>(null);

export function NewIssueProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  // `c` opens it, the key Linear, Jira and GitHub all use for the same thing.
  // lib/shortcuts.ts ignores it while the Human is typing: a shortcut that eats
  // a letter out of a title is worse than no shortcut.
  useShortcut("c", show);
  // While it is open the page behind it goes quiet, `c` included.
  useShortcutScope("new-issue", open);

  return (
    <NewIssueContext.Provider value={{ open: show }}>
      {children}
      <NewIssueDialog open={open} onOpenChange={setOpen} />
    </NewIssueContext.Provider>
  );
}

/** How to open the New Issue dialog from anywhere under the provider. */
export function useNewIssue() {
  const context = useContext(NewIssueContext);
  if (!context) throw new Error("useNewIssue needs a NewIssueProvider above it");
  return context;
}

export function NewIssueButton({
  variant = "outline",
  size = "sm",
  withShortcut = false,
}: {
  variant?: "outline" | "default" | "ghost";
  size?: "sm" | "default";
  withShortcut?: boolean;
}) {
  const { open } = useNewIssue();
  return (
    <Button variant={variant} size={size} onClick={open}>
      <Plus />
      New Issue
      {withShortcut ? <Shortcut keys="c" className="ml-auto" /> : null}
    </Button>
  );
}

function NewIssueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [projectKey, setProjectKey] = useState("");
  const [title, setTitle] = useState("");

  // Only asked for while the dialog is open: every signed-in page mounts this
  // button, and a Projects query per page load would be a query nobody reads.
  const projects = useQuery({ ...orpc.projects.list.queryOptions({ input: {} }), enabled: open });
  const options = projects.data?.projects ?? [];
  // The Workspace's only Project is not a question worth asking, so it answers
  // itself; with several, the Human chooses and nothing is preselected.
  const chosen = projectKey || (options.length === 1 ? (options[0]?.key ?? "") : "");

  const create = useMutation(
    orpc.issues.create.mutationOptions({
      onSuccess: async (issue: { key: string }) => {
        await queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
        onOpenChange(false);
        setTitle("");
        setProjectKey("");
        // Straight to what was just made: an Issue created and then hidden
        // behind navigation is the problem this whole component exists for.
        await navigate({ to: "/issues/$issueKey", params: { issueKey: issue.key } });
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Issue</DialogTitle>
          <DialogDescription>
            It opens in the first State of its Project&apos;s Workflow. Everything else — the
            Assignee, the Labels, the Documents — is set on the Issue itself.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            if (chosen && title.trim()) create.mutate({ projectKey: chosen, title: title.trim() });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-issue-project">Project</Label>
            <OptionsSelect
              id="new-issue-project"
              className="w-full"
              value={chosen}
              onChange={setProjectKey}
              placeholder="Choose a Project"
              options={[
                { value: "", label: "Choose a Project" },
                ...options.map((project: { id: string; key: string; name: string }) => ({
                  value: project.key,
                  label: `${project.name} (${project.key})`,
                })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-issue-title">Title</Label>
            <Input
              id="new-issue-title"
              value={title}
              placeholder="What needs doing?"
              onChange={(changed) => setTitle(changed.target.value)}
            />
          </div>
          {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !chosen || !title.trim()}>
              Create Issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
