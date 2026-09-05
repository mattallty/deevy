import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { SettingsPage } from "@/components/settings-page";
import { orpc } from "@/lib/orpc.ts";

const kindLabels = {
  email_domain: "Email domain",
  github_org: "GitHub organization",
} as const;

type RuleKind = keyof typeof kindLabels;

/**
 * M1 admits teammates by rule rather than by invitation: any sign-in matching a
 * rule below joins the Workspace as a Member.
 */
export function AllowlistPage() {
  const queryClient = useQueryClient();
  const rules = useQuery(orpc.allowlist.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.allowlist.key() });

  const [kind, setKind] = useState<RuleKind>("email_domain");
  const [value, setValue] = useState("");
  const add = useMutation(
    orpc.allowlist.add.mutationOptions({
      onSuccess: async () => {
        setValue("");
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.allowlist.remove.mutationOptions({ onSuccess: refresh }));
  const failed = add.error ?? remove.error;

  return (
    <SettingsPage
      title="Allowlist"
      description={<>A sign-in matching any rule below joins this Workspace as a Member.</>}
    >
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (value.trim()) add.mutate({ kind, value: value.trim() });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="rule-kind">Match on</Label>
          <Select value={kind} onValueChange={(next) => setKind(next as RuleKind)}>
            <SelectTrigger id="rule-kind" className="w-56">
              <SelectValue>{(selected: RuleKind) => kindLabels[selected]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="email_domain">{kindLabels.email_domain}</SelectItem>
                <SelectItem value="github_org">{kindLabels.github_org}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="rule-value">
            {kind === "email_domain" ? "Domain" : "Organization login"}
          </Label>
          <Input
            id="rule-value"
            value={value}
            placeholder={kind === "email_domain" ? "example.com" : "acme"}
            onChange={(changed) => setValue(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={add.isPending || !value.trim()}>
          Add rule
        </Button>
      </form>

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}

      {rules.isPending ? <p className="text-muted-foreground">Loading rules…</p> : null}
      {rules.isError ? (
        <p className="text-destructive">Could not load the allowlist: {rules.error.message}</p>
      ) : null}
      {rules.data ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Match on</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.data.rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="text-muted-foreground">{kindLabels[rule.kind]}</TableCell>
                <TableCell className="font-medium">{rule.value}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ ruleId: rule.id })}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {rules.data?.rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rules yet, so nobody new can join. Add one above.
        </p>
      ) : null}
    </SettingsPage>
  );
}
