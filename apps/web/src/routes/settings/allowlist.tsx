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
  gitlab_group: "GitLab group",
} as const;

/** What the value field asks for, and what it shows as an example, per kind. */
const valueFields = {
  email_domain: { label: "Domain", placeholder: "example.com" },
  github_org: { label: "Organization login", placeholder: "acme" },
  gitlab_group: { label: "Group path", placeholder: "acme/platform" },
} as const;

/** The word a chip wears so a bare value says which namespace it is in. */
const kindPrefixes = {
  email_domain: null,
  github_org: "org",
  gitlab_group: "group",
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
      below={
        adding ? (
          <form
            // Stacked until the row is wide enough for a line of fields: side by
            // side in 340px the domain shrank to a sliver and Cancel fell off it.
            className="flex flex-col gap-3 rounded-md border bg-card p-3 @md:flex-row @md:flex-wrap @md:items-end"
            onSubmit={(submitted) => {
              submitted.preventDefault();
              if (value.trim()) add.mutate({ kind, value: value.trim() });
            }}
          >
            <div className="flex flex-col gap-2 @md:w-48">
              <Label htmlFor="rule-kind">Match on</Label>
              <Select value={kind} onValueChange={(next) => setKind(next as RuleKind)}>
                <SelectTrigger id="rule-kind" className="w-full">
                  <SelectValue>{(selected: RuleKind) => kindLabels[selected]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="email_domain">{kindLabels.email_domain}</SelectItem>
                    <SelectItem value="github_org">{kindLabels.github_org}</SelectItem>
                    <SelectItem value="gitlab_group">{kindLabels.gitlab_group}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 @md:min-w-48 @md:flex-1">
              <Label htmlFor="rule-value">{valueFields[kind].label}</Label>
              <Input
                id="rule-value"
                value={value}
                autoFocus
                placeholder={valueFields[kind].placeholder}
                onChange={(changed) => setValue(changed.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
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
            </div>
          </form>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2 @lg:justify-end">
        {listed.map((rule) => (
          <span
            key={rule.id}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border pr-1 pl-2.5 font-mono text-xs"
          >
            {kindPrefixes[rule.kind] ? (
              <span className="font-sans text-muted-foreground">{kindPrefixes[rule.kind]}</span>
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

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}
      {rules.isError ? (
        <p className="text-sm text-destructive">Could not load it: {rules.error.message}</p>
      ) : null}
    </SettingsRow>
  );
}
