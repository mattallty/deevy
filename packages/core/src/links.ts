import type { Repository } from "@deevy/db";

export type LinkKind = "pull_request" | "commit" | "branch" | "url";

export interface ParsedLink {
  kind: LinkKind;
  /** The pull request number, the commit SHA, or the branch name. */
  ref: string | null;
  repositoryId: string | null;
}

type KnownRepository = Pick<Repository, "id" | "url">;

/**
 * What a pasted URL points at. GitHub and GitLab name the same three things
 * differently, so the shapes are listed rather than guessed at, and anything
 * unrecognised is an ordinary `url` — a Link to a design or a document is as
 * valid as one to a pull request.
 *
 * The Repository is matched by URL prefix, so a Link into a Repository nobody
 * registered still gets its kind and ref, just no Repository.
 */
export function parseLink(url: string, repositories: KnownRepository[]): ParsedLink {
  const repositoryId = matchRepository(url, repositories);
  const patterns: Array<[RegExp, LinkKind]> = [
    // GitHub
    [/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)/i, "pull_request"],
    [/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/commit\/([0-9a-f]{6,40})/i, "commit"],
    [/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/tree\/(.+)$/i, "branch"],
    // GitLab, which puts everything under /-/
    [/^https?:\/\/[^/]+\/.+\/-\/merge_requests\/(\d+)/i, "pull_request"],
    [/^https?:\/\/[^/]+\/.+\/-\/commit\/([0-9a-f]{6,40})/i, "commit"],
    [/^https?:\/\/[^/]+\/.+\/-\/tree\/(.+)$/i, "branch"],
  ];

  for (const [pattern, kind] of patterns) {
    const match = pattern.exec(url);
    if (match) return { kind, ref: decodeURIComponent(match[1]!), repositoryId };
  }
  return { kind: "url", ref: null, repositoryId };
}

function matchRepository(url: string, repositories: KnownRepository[]): string | null {
  const normalised = url.replace(/\/+$/, "").toLowerCase();
  // The longest matching prefix wins, so a Repository nested under another is
  // not shadowed by its parent.
  let best: KnownRepository | null = null;
  for (const repository of repositories) {
    const prefix = repository.url.replace(/\/+$/, "").toLowerCase();
    if (normalised === prefix || normalised.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best.url.length) best = repository;
    }
  }
  return best?.id ?? null;
}
