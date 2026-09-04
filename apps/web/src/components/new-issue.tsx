import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
import { NativeSelect } from "@/components/ui/native-select";
import { orpc } from "@/lib/orpc";

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
 */
export function NewIssueButton() {
  const [open, setOpen] = useState(false);

  useNewIssueShortcut(() => setOpen(true));

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        New Issue
      </Button>
      <NewIssueDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * `c` opens it, the key Linear, Jira and GitHub all use for the same thing.
 *
 * Ignored while the Human is typing: a shortcut that eats a letter out of a
 * title is worse than no shortcut, and the Project page's own New Issue field
 * is one keystroke away from this one.
 */
function useNewIssueShortcut(open: () => void) {
  useEffect(() => {
    function onKeyDown(pressed: KeyboardEvent) {
      if (pressed.key !== "c") return;
      if (pressed.metaKey || pressed.ctrlKey || pressed.altKey) return;
      if (isTyping(pressed.target)) return;
      pressed.preventDefault();
      open();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
}

/** Whether the keystroke belongs to something the Human is writing in. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
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
            <NativeSelect
              id="new-issue-project"
              value={chosen}
              onChange={(changed) => setProjectKey(changed.target.value)}
            >
              <option value="">Choose a Project</option>
              {options.map((project: { id: string; key: string; name: string }) => (
                <option key={project.id} value={project.key}>
                  {project.name} ({project.key})
                </option>
              ))}
            </NativeSelect>
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
