import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { LabelBadge, LabelText } from "@/components/label-badge";
import { labelText } from "@/lib/labels";
import { RailHeading } from "@/components/rail-heading";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/orpc";
import { PAGE_SCOPE, useShortcut } from "@/lib/shortcuts";

interface PickerLabel {
  id: string;
  scope: string | null;
  name: string;
  color: string;
}

interface PickerProps {
  issueKey: string;
  labels: PickerLabel[];
  /** The shortcut scope the Issue is shown in, so `l` reaches this picker. */
  shortcutScope?: string;
}

/**
 * The Issue's Labels as chips, and one box to add more from the Workspace's
 * (docs/plans/ui-redesign-2.md slice E): a multi-select Combobox, typed into,
 * instead of every Label laid out as a toggle — which stopped reading past a
 * dozen. Choosing sends the whole selection, the chosen one last, because the
 * one-per-scope rule is resolved server-side: a second `epic:` replaces the first.
 */
export function LabelPicker({ issueKey, labels, shortcutScope = PAGE_SCOPE }: PickerProps) {
  const queryClient = useQueryClient();
  const all = useQuery(orpc.labels.list.queryOptions({ input: {} }));
  const setLabels = useMutation(
    orpc.issues.setLabels.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.issues.key() }),
    }),
  );
  const anchor = useComboboxAnchor();
  const input = useRef<HTMLInputElement>(null);
  useShortcut("l", () => input.current?.focus(), { scope: shortcutScope });

  const options = [...(all.data?.labels ?? [])].sort(
    (a, b) => (a.scope ?? "").localeCompare(b.scope ?? "") || a.name.localeCompare(b.name),
  );
  const on = new Set(labels.map((label) => label.id));

  const choose = (next: PickerLabel[]) => {
    // Whatever was just added goes last, so it wins its scope.
    const kept = next.filter((label) => on.has(label.id)).map((label) => label.id);
    const added = next.filter((label) => !on.has(label.id)).map((label) => label.id);
    setLabels.mutate({ key: issueKey, labelIds: [...kept, ...added] });
  };

  return (
    <section className="flex flex-col gap-2">
      <RailHeading>Labels</RailHeading>
      <div role="group" aria-label="Labels">
        <Combobox
          multiple
          items={options}
          value={labels}
          onValueChange={(next) => choose(next as PickerLabel[])}
          itemToStringLabel={(label: PickerLabel) => labelText(label)}
          isItemEqualToValue={(a: PickerLabel, b: PickerLabel) => a.id === b.id}
          disabled={setLabels.isPending}
        >
          <ComboboxChips ref={anchor}>
            <ComboboxValue>
              {(value: PickerLabel[]) =>
                value.map((label) => (
                  <ComboboxChip
                    key={label.id}
                    aria-label={labelText(label)}
                    removeLabel={`Remove ${labelText(label)}`}
                    className={cn(label.scope && "pl-0.5")}
                    style={{ borderLeft: `3px solid ${label.color}` }}
                  >
                    <LabelText
                      label={label}
                      scopeClassName="text-white"
                      scopeStyle={{ backgroundColor: label.color }}
                    />
                  </ComboboxChip>
                ))
              }
            </ComboboxValue>
            <ComboboxChipsInput
              ref={input}
              aria-label="Labels"
              placeholder={labels.length > 0 ? "Add…" : "Add a Label…"}
            />
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>
              {all.data && all.data.labels.length === 0
                ? "No Labels defined yet. Add some under Settings."
                : "No Label matches."}
            </ComboboxEmpty>
            <ComboboxList>
              {(label: PickerLabel) => (
                <ComboboxItem key={label.id} value={label}>
                  <LabelBadge label={label} />
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      {setLabels.error ? (
        <p className="text-xs text-destructive">{setLabels.error.message}</p>
      ) : null}
    </section>
  );
}
