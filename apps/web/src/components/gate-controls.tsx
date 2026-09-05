import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";
import { PAGE_SCOPE, useShortcut } from "@/lib/shortcuts";

interface State {
  id: string;
  name: string;
  isGate: boolean;
}

interface GateControlsProps {
  /** The shortcut scope the Issue is shown in, so `s`, `⇧A` and `⇧R` reach this card. */
  shortcutScope?: string;
  issueKey: string;
  projectKey: string;
  state: State;
  decisions: Array<{
    id: string;
    decision: string;
    note: string | null;
    createdAt: string | Date;
  }>;
}

/**
 * How an Issue leaves the State it is in. A Gate needs a Human's approval
 * (CONTEXT.md), so it gets Approve and Reject; anything else gets a plain
 * State picker.
 */
export function GateControls({
  issueKey,
  projectKey,
  state,
  decisions,
  shortcutScope = PAGE_SCOPE,
}: GateControlsProps) {
  const queryClient = useQueryClient();
  const workflow = useQuery(orpc.workflow.get.queryOptions({ input: { projectKey } }));
  // A ruling changes the Issue, what the inbox owes, and the Run that asked.
  const refresh = () =>
    Promise.all(
      [orpc.issues.key(), orpc.inbox.key(), orpc.runs.key()].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  const approve = useMutation(orpc.gates.approve.mutationOptions({ onSuccess: refresh }));
  const reject = useMutation(orpc.gates.reject.mutationOptions({ onSuccess: refresh }));
  const move = useMutation(orpc.issues.move.mutationOptions({ onSuccess: refresh }));
  const [note, setNote] = useState("");
  const busy = approve.isPending || reject.isPending || move.isPending;
  const failed = approve.error ?? reject.error ?? move.error;

  // The keyboard (docs/plans/ui-redesign.md): `s` opens the State picker, or on
  // a Gate puts the cursor in the Note; `⇧A` / `⇧R` do that with the ruling
  // chosen, so that `⌘↵` in the Note is the ruling. Nothing here commits
  // without that last key or a click.
  const noteField = useRef<HTMLTextAreaElement>(null);
  const [stateOpen, setStateOpen] = useState(false);
  const [ruling, setRuling] = useState<"approve" | "reject">("approve");
  const rule = (which: "approve" | "reject") => {
    if (busy) return;
    const input = { key: issueKey, note: note.trim() || null };
    if (which === "approve") approve.mutate(input);
    else reject.mutate(input);
  };
  const aim = (which: "approve" | "reject") => {
    setRuling(which);
    noteField.current?.scrollIntoView({ block: "center" });
    noteField.current?.focus();
  };
  useShortcut("s", () => (state.isGate ? aim(ruling) : setStateOpen(true)), {
    scope: shortcutScope,
  });
  useShortcut("shift+a", () => aim("approve"), { scope: shortcutScope, enabled: state.isGate });
  useShortcut("shift+r", () => aim("reject"), { scope: shortcutScope, enabled: state.isGate });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">State</h2>

      {state.isGate ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm">
            <strong>{state.name}</strong> is a Gate: {issueKey} cannot leave it without a
            Human&apos;s decision.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="gate-note">Note</Label>
            <Textarea
              id="gate-note"
              ref={noteField}
              rows={3}
              value={note}
              placeholder="Optional. Why you are approving or rejecting."
              onChange={(changed) => setNote(changed.target.value)}
              onKeyDown={(pressed) => {
                if (pressed.key === "Enter" && (pressed.metaKey || pressed.ctrlKey)) {
                  pressed.preventDefault();
                  rule(ruling);
                }
              }}
            />
          </div>
          <div className="flex gap-2" data-ruling={ruling}>
            <Button
              variant={ruling === "approve" ? "default" : "outline"}
              disabled={busy}
              onClick={() => rule("approve")}
            >
              Approve
            </Button>
            <Button
              variant={ruling === "reject" ? "default" : "outline"}
              disabled={busy}
              onClick={() => rule("reject")}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <Select
          value={state.id}
          disabled={busy}
          open={stateOpen}
          onOpenChange={setStateOpen}
          onValueChange={(next) => {
            if (next && next !== state.id) move.mutate({ key: issueKey, stateId: next });
          }}
        >
          <SelectTrigger aria-label="State" className="w-64">
            <SelectValue>
              {(selected: string) =>
                workflow.data?.states.find((s) => s.id === selected)?.name ?? state.name
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {workflow.data?.states.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
                {option.isGate ? " (Gate)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}

      {decisions.length > 0 ? (
        <ul aria-label="Gate decisions" className="flex flex-col gap-2">
          {decisions.map((decision) => (
            <li key={decision.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <Badge variant={decision.decision === "approved" ? "default" : "destructive"}>
                {decision.decision}
              </Badge>
              {decision.note ? <span>{decision.note}</span> : null}
              <span className="text-xs text-muted-foreground">
                {new Date(decision.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
