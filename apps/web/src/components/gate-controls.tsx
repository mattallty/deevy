import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

interface State {
  id: string;
  name: string;
  isGate: boolean;
}

interface GateControlsProps {
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
export function GateControls({ issueKey, projectKey, state, decisions }: GateControlsProps) {
  const queryClient = useQueryClient();
  const workflow = useQuery(orpc.workflow.get.queryOptions({ input: { projectKey } }));
  const refresh = () => queryClient.invalidateQueries();

  const approve = useMutation(orpc.gates.approve.mutationOptions({ onSuccess: refresh }));
  const reject = useMutation(orpc.gates.reject.mutationOptions({ onSuccess: refresh }));
  const move = useMutation(orpc.issues.move.mutationOptions({ onSuccess: refresh }));
  const [note, setNote] = useState("");
  const busy = approve.isPending || reject.isPending || move.isPending;
  const failed = approve.error ?? reject.error ?? move.error;

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
              rows={3}
              value={note}
              placeholder="Optional. Why you are approving or rejecting."
              onChange={(changed) => setNote(changed.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => approve.mutate({ key: issueKey, note: note.trim() || null })}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => reject.mutate({ key: issueKey, note: note.trim() || null })}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <Select
          value={state.id}
          disabled={busy}
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
