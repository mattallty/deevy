---
"@deevy/core": minor
"@deevy/db": minor
"@deevy/web": minor
---

Repositories are gone. Registering one only ever decorated a Link with the repository's own name and cost a settings screen, a table, two Event kinds and three API operations to do it; nothing read the attribution back, and it was never what let an Agent push — where a Run pushes is the runtime's own configuration.

What this changes for you: the `repositories.list`, `repositories.create` and `repositories.delete` operations and the Settings › Repositories screen no longer exist, a Link no longer carries a `repository` or `repositoryId` (its kind and ref are still derived from the URL exactly as before), and the `repository.created` and `repository.deleted` Events are no longer written. The migration drops the `repository` table and the `issue_link.repository_id` column; the Links themselves are kept. The Workspace set-up strip also drops its allowlist item, whose fix was the Allowlist row on the same page, so it now counts a Project, an Agent and a Channel.
