import { MemberChip, type ChipMember } from "@/components/member-chip";
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

/**
 * The Humans a Gate names as its approvers (docs/plans/ui-redesign-2.md slice H):
 * a multi-select Combobox with chips, the same pattern as the Labels picker.
 * Only Humans are offered — an Agent never decides a Gate (ADR-0004) — and
 * naming nobody leaves the ruling to any Human, which the empty box says.
 */
export function ApproversPicker({
  id,
  humans,
  value,
  onChange,
}: {
  /** The input's id, so the "Approvers for <State>" label reaches it. */
  id: string;
  humans: ChipMember[];
  value: string[];
  onChange: (memberIds: string[]) => void;
}) {
  const anchor = useComboboxAnchor();
  const chosen = value.flatMap((memberId) => {
    const human = humans.find((candidate) => candidate.id === memberId);
    return human ? [human] : [];
  });
  return (
    <Combobox
      multiple
      items={humans}
      value={chosen}
      onValueChange={(next) => onChange((next as ChipMember[]).map((human) => human.id))}
      itemToStringLabel={(human: ChipMember) => human.user.name}
      isItemEqualToValue={(a: ChipMember, b: ChipMember) => a.id === b.id}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(picked: ChipMember[]) =>
            picked.map((human) => (
              <ComboboxChip key={human.id} removeLabel={`Remove ${human.user.name}`}>
                <MemberChip member={human} size="xs" />
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          placeholder={chosen.length > 0 ? "Add…" : "Any Human may decide; name some…"}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No Human by that name.</ComboboxEmpty>
        <ComboboxList>
          {(human: ChipMember) => (
            <ComboboxItem key={human.id} value={human}>
              {human.user.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
