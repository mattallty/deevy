import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/data-table";
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

  type RuleRow = NonNullable<typeof rules.data>["rules"][number];
  const columns: DataColumn<RuleRow>[] = [
    {
      id: "kind",
      header: "Match on",
      cell: (rule) => <span className="text-muted-foreground">{kindLabels[rule.kind]}</span>,
      sortValue: (rule) => kindLabels[rule.kind],
    },
    {
      id: "value",
      header: "Value",
      cell: (rule) => <span className="font-medium">{rule.value}</span>,
      sortValue: (rule) => rule.value,
      className: "w-full",
    },
    {
      id: "actions",
      header: "",
      cell: (rule) => (
        <Button
          variant="destructive"
          size="sm"
          disabled={remove.isPending}
          onClick={() => remove.mutate({ ruleId: rule.id })}
        >
          Remove
        </Button>
      ),
      className: "text-right",
    },
  ];

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

      {rules.isError ? (
        <p className="text-destructive">Could not load the allowlist: {rules.error.message}</p>
      ) : (
        <DataTable
          aria-label="Allowlist"
          columns={columns}
          rows={rules.data?.rules ?? []}
          getRowId={(rule) => rule.id}
          loading={rules.isPending}
          empty={{
            icon: ShieldCheck,
            title: "No rules yet",
            description:
              "Nobody new can join until there is one. Add a domain or an address above.",
          }}
        />
      )}
    </SettingsPage>
  );
}
