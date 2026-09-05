import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/orpc.ts";

/**
 * Who is in the Workspace, and the two levers an admin has over them: the role,
 * and whether they are suspended. There are no invitations in M1; a teammate
 * joins because an allowlist rule matched their sign-in.
 */
export function MembersPage() {
  const queryClient = useQueryClient();
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.members.key() });

  const updateRole = useMutation(orpc.members.updateRole.mutationOptions({ onSuccess: refresh }));
  const suspend = useMutation(orpc.members.suspend.mutationOptions({ onSuccess: refresh }));
  const reinstate = useMutation(orpc.members.reinstate.mutationOptions({ onSuccess: refresh }));
  const busy = updateRole.isPending || suspend.isPending || reinstate.isPending;
  const failed = updateRole.error ?? suspend.error ?? reinstate.error;

  if (members.isPending) return <p className="text-muted-foreground">Loading Members…</p>;
  if (members.isError) {
    return <p className="text-destructive">Could not load Members: {members.error.message}</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in this Workspace. Add an allowlist rule to let more people in.
        </p>
      </header>

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Handle</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.data.members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="font-medium">{member.user.name}</div>
                <div className="text-xs text-muted-foreground">{member.user.email}</div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {member.handle ? `@${member.handle}` : "—"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Select
                    value={member.role}
                    disabled={busy}
                    onValueChange={(role) =>
                      updateRole.mutate({ memberId: member.id, role: role as "admin" | "member" })
                    }
                  >
                    <SelectTrigger aria-label={`Role of ${member.user.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="member">member</SelectItem>
                    </SelectContent>
                  </Select>
                  {member.kind === "agent" ? <Badge variant="secondary">Agent</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {member.suspendedAt ? (
                  <div className="flex items-center justify-end gap-2">
                    <Badge variant="destructive">Suspended</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => reinstate.mutate({ memberId: member.id })}
                    >
                      Reinstate
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => suspend.mutate({ memberId: member.id })}
                  >
                    Suspend
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
