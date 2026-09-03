import { member, team, type Db } from "@deevy/db";
import { like } from "drizzle-orm";

/**
 * Members and Teams share one handle namespace, so a mention like `@platform`
 * resolves to exactly one thing (slice 10). Both tables are read in two
 * statements rather than probing a suffix at a time, since D1 charges per
 * round trip (docs/plans/m1.md).
 */
export async function allocateHandle(db: Db, from: string): Promise<string> {
  const base = slugify(from.split("@")[0] ?? from);
  const prefix = `${base}%`;
  const [members, teams] = await Promise.all([
    db.select({ handle: member.handle }).from(member).where(like(member.handle, prefix)),
    db.select({ handle: team.handle }).from(team).where(like(team.handle, prefix)),
  ]);
  const taken = new Set([...members, ...teams].map((row) => row.handle));

  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workspace";
}
