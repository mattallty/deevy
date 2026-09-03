/** How a Label reads: `backend`, or `epic: Checkout rewrite` when it has a scope. */
export function labelText(label: { scope: string | null; name: string }): string {
  return label.scope ? `${label.scope}: ${label.name}` : label.name;
}
