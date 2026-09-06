import * as React from "react";
import { useComposedRefs } from "@/lib/compose-refs";

/**
 * Renders its one child with this element's props merged in — what `asChild`
 * means in the registries that use it. deevy is a Base UI project and keeps
 * `radix-ui` out of the bundle, so the twenty lines the Dice UI sortable needed
 * from it live here instead (.claude/skills/deevy-ui, "Registries").
 */
export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(function Slot(
  { children, ...slotProps },
  forwardedRef,
) {
  // The hook runs on every render, before the guard, as the rules of hooks ask.
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<Record<string, unknown>> & { ref?: React.Ref<HTMLElement> })
    : null;
  const childProps = child?.props ?? {};
  const childRef = (childProps.ref as React.Ref<HTMLElement> | undefined) ?? child?.ref;
  const ref = useComposedRefs(forwardedRef, childRef);
  if (!child) return null;

  const merged: Record<string, unknown> = { ...childProps };
  for (const [name, value] of Object.entries(slotProps)) {
    const own = childProps[name];
    if (/^on[A-Z]/.test(name) && typeof own === "function" && typeof value === "function") {
      // Both handlers run: the slot's, then the child's.
      merged[name] = (...args: unknown[]) => {
        (value as (...a: unknown[]) => void)(...args);
        (own as (...a: unknown[]) => void)(...args);
      };
    } else if (
      name === "style" &&
      own &&
      typeof own === "object" &&
      value &&
      typeof value === "object"
    ) {
      merged.style = { ...(own as object), ...(value as object) };
    } else if (name === "className") {
      merged.className = [own, value].filter(Boolean).join(" ");
    } else {
      merged[name] = value;
    }
  }
  return React.cloneElement(child, { ...merged, ref });
});
