import { fireEvent, screen } from "@testing-library/react";

/**
 * Drives a shadcn (Base UI) Select in jsdom: its trigger is a `combobox` named
 * by its label, ArrowDown opens the portalled listbox, and an option is chosen
 * by highlighting it and pressing Enter — a click does not select there. The
 * chosen label is the trigger's text.
 */
export async function pickOption(trigger: HTMLElement, name: string | RegExp) {
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name });
  fireEvent.mouseMove(option);
  fireEvent.keyDown(option, { key: "Enter" });
}

export function selectedLabel(trigger: HTMLElement): string {
  const value = trigger.querySelector('[data-slot="select-value"]') ?? trigger;
  return value.textContent?.replace(/▼$/, "").trim() ?? "";
}
