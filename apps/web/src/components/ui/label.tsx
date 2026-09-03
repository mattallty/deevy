import type { ComponentProps } from "react";
import { cn } from "@/lib/utils.ts";

// Base UI has no Label primitive; a native label is the whole of it.
export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("text-sm font-medium leading-none select-none", className)} {...props} />
  );
}
