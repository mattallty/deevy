import { Toaster, toast } from "@deevy/design-system";
import { useEffect } from "react";

/** Toasts land bottom-right: a success with the Issue's key, a plain confirmation, and an error with what to do. */
export const Toasts = () => {
  useEffect(() => {
    toast.success("Issue DEV-42 created");
    toast("Copied DEV-42");
    toast.error("Could not approve the Gate", {
      description: "Grace Hopper approved it a moment ago. Reload to see the ruling.",
    });
  }, []);
  return (
    <div className="min-h-64">
      <Toaster position="bottom-right" expand />
    </div>
  );
};
