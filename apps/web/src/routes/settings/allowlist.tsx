import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, X } from "lucide-react";
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
import { SettingsRow } from "@/components/settings-page";
import { orpc } from "@/lib/orpc.ts";

const kindLabels = {
  email_domain: "Email domain",
  github_org: "GitHub organization",
} as const;

type RuleKind = keyof typeof kindLabels;

/**
 * M1 admits teammates by rule rather than by invitation: any sign-in matching a
 * rule joins the Workspace as a Member. A row on Workspace › General rather than
 * a page of its own — who may join is a fact about the Workspace (Matt,
 * 2026-09-07) — and the rules are chips rather than a table: nearly every rule
 * is one domain, and a three-control form standing open for it was more page
 * than the fact deserved. The form is behind Add rule.
 */
export function AllowlistRow() {
  const queryClient = useQueryClient();
  const rules = useQuery(orpc.allowlist.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.allowlist.key() });

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<RuleKind>("email_domain");
  const [value, setValue] = useState("");

  const add = useMutation(
    orpc.allowlist.add.mutationOptions({
      onSuccess: async () => {
        setValue("");
        setAdding(false);
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.allowlist.remove.mutationOptions({ onSuccess: refresh }));
  const failed = add.error ?? remove.error;
  const listed = rules.data?.rules ?? [];

  return (
    <SettingsRow
      label="Who may join"
      hint={
        listed.length === 0 && !rules.isPending
          ? "Nobody new can join until there is a rule. Only the admin in DEEVY_ADMIN_EMAIL gets in."
          : "A sign-in matching any of these joins the Workspace as a Member."
      }
    >
      <div className="flex flex-wrap items-center gap-2 @lg:justify-end">
        {listed.map((rule) => (
          <span
            key={rule.id}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border pr-1 pl-2.5 font-mono text-xs"
          >
            {rule.kind === "github_org" ? (
              <span className="font-sans text-muted-foreground">org</span>
            ) : null}
            {rule.value}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Stop allowing ${rule.value}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate({ ruleId: rule.id })}
            >
              <X aria-hidden />
            </Button>
          </span>
        ))}
        {rules.isPending ? <span className="text-sm text-muted-foreground">Loading…</span> : null}
        {!adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add rule
          </Button>
        ) : null}
      </div>

      {adding ? (
        <form
          className="flex flex-wrap items-end gap-2 @lg:justify-end"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            if (value.trim()) add.mutate({ kind, value: value.trim() });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="rule-kind">Match on</Label>
            <Select value={kind} onValueChange={(next) => setKind(next as RuleKind)}>
              <SelectTrigger id="rule-kind" className="w-48">
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="rule-value">
              {kind === "email_domain" ? "Domain" : "Organization login"}
            </Label>
            <Input
              id="rule-value"
              value={value}
              autoFocus
              className="w-48"
              placeholder={kind === "email_domain" ? "example.com" : "acme"}
              onChange={(changed) => setValue(changed.target.value)}
            />
          </div>
          <Button type="submit" disabled={add.isPending || !value.trim()}>
            Add rule
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setValue("");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : null}

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}
      {rules.isError ? (
        <p className="text-sm text-destructive">Could not load it: {rules.error.message}</p>
      ) : null}
    </SettingsRow>
  );
}
