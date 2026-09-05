import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  value: string;
  label: ReactNode;
}

/** Base UI wants a real value; an option meaning "none" rides as this and comes back as "". */
const NONE = "__none";

/**
 * A select over a flat list of options, composed as shadcn's Base UI docs
 * compose it — trigger and value, then one group of items — so every plain
 * choice in the app renders the same and none is a native <select> again
 * (docs/plans/ui-redesign-2.md, point 19). `value` and `onChange` speak
 * strings, "" meaning none; the tree is the same whatever the options.
 */
export function OptionsSelect({
  id,
  value,
  onChange,
  options,
  disabled = false,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** Shown when the value matches no option. */
  placeholder?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const encode = (candidate: string) => (candidate === "" ? NONE : candidate);
  const decode = (candidate: string) => (candidate === NONE ? "" : candidate);
  return (
    <Select
      value={encode(value)}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(decode(next));
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
        <SelectValue>
          {(selected: string) =>
            options.find((option) => encode(option.value) === selected)?.label ??
            placeholder ??
            decode(selected)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={encode(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
