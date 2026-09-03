/** Projects arrive in slice 3; until then the Workspace has a home page and nothing in it. */
export function ProjectsPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="text-sm text-muted-foreground">
        This Workspace has no Projects yet. Creating them arrives with the next slice; meanwhile,
        invite the rest of the team by adding an allowlist rule.
      </p>
    </section>
  );
}
