import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { labelText } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface LabelLike {
  scope: string | null;
  name: string;
  color: string;
}

/**
 * How a Label reads on screen: the scope as a small pill inside the badge, then
 * the name — `[[epic] Agent loop]`, not `[epic: Agent loop]`. What carries it
 * names itself `epic: Agent loop` (`labelText`), for a screen reader and a test.
 */
export function LabelText({
  label,
  scopeClassName,
  scopeStyle,
}: {
  label: LabelLike;
  scopeClassName?: string;
  scopeStyle?: CSSProperties;
}): ReactNode {
  if (!label.scope) return label.name;
  return (
    <>
      <span
        className={cn(
          "inline-flex h-4 items-center rounded-full px-1.5 text-[10px] leading-none font-semibold",
          scopeClassName,
        )}
        style={scopeStyle}
      >
        {label.scope}
      </span>
      {label.name}
    </>
  );
}

/**
 * A Label as a badge. `solid` paints the badge in the Label's colour with the
 * scope pill knocked out of it (the Settings list); `outline` keeps the badge
 * quiet and gives only the scope pill the colour (Issue lists and Boards), so
 * a row with three Labels stays readable.
 */
export function LabelBadge({
  label,
  variant = "outline",
  className,
}: {
  label: LabelLike;
  variant?: "solid" | "outline";
  className?: string;
}) {
  const scoped = Boolean(label.scope);
  if (variant === "solid") {
    return (
      <Badge
        aria-label={labelText(label)}
        className={cn("gap-1.5", scoped && "pl-0.75", className)}
        style={{ backgroundColor: label.color, color: "#fff" }}
      >
        <LabelText label={label} scopeClassName="bg-white/90" scopeStyle={{ color: label.color }} />
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      aria-label={labelText(label)}
      className={cn("gap-1.5 font-normal", scoped && "pl-0.75", className)}
    >
      <LabelText
        label={label}
        scopeClassName="text-white"
        scopeStyle={{ backgroundColor: label.color }}
      />
    </Badge>
  );
}
