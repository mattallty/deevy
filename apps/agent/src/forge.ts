import type { RepoConfig } from "./workspace.ts";

export interface PullRequest {
  url: string;
  number: number;
}

export interface PullRequestDraft {
  branch: string;
  base: string;
  title: string;
  body: string;
}

/**
 * Where a pull request gets opened.
 *
 * One interface with one implementation, because the point is the seam rather
 * than the choice: opening a pull request is the only step in the runtime that
 * needs a third party, so it is the only step a test needs to stub.
 */
export interface Forge {
  open(draft: PullRequestDraft): Promise<PullRequest>;
}

/** `owner/name` from a GitHub clone URL, or null when it is not one. */
export function githubSlug(url: string): string | null {
  const match = /^https:\/\/(?:[^@/]*@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  return match ? `${match[1]}/${match[2]}` : null;
}

export function githubForge(options: {
  slug: string;
  token: string;
  /** The API root. GitHub Enterprise has its own, and so does a local stub. */
  api?: string;
  fetch?: typeof globalThis.fetch;
}): Forge {
  const call = options.fetch ?? globalThis.fetch;
  const api = (options.api ?? "https://api.github.com").replace(/\/+$/, "");
  return {
    async open(draft) {
      const res = await call(`${api}/repos/${options.slug}/pulls`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.token}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({
          head: draft.branch,
          base: draft.base,
          title: draft.title,
          body: draft.body,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`GitHub refused the pull request: ${res.status} ${text}`);
      const opened = JSON.parse(text) as { html_url: string; number: number };
      return { url: opened.html_url, number: opened.number };
    },
  };
}

export interface ForgeConfig {
  repo: RepoConfig | null;
  /** The API root, when it is not github.com's. */
  githubApi?: string;
  /** `owner/name`, when it cannot be read off the clone URL. */
  githubRepo?: string;
}

/**
 * The forge for a repository, when there is one to be had.
 *
 * A repository with no credential, or one whose owner and name cannot be
 * established, gets a branch pushed and no pull request. That is a smaller
 * record rather than a broken one, and the operator can see the branch.
 *
 * The two overrides exist because the clone URL is not always the whole story:
 * GitHub Enterprise has its own API root, and an acceptance run against a
 * repository on disk has neither host nor slug to read
 * (docs/m4-acceptance.md).
 */
export function forgeFor(config: ForgeConfig, fetch?: typeof globalThis.fetch): Forge | null {
  const repo = config.repo;
  if (!repo?.token) return null;
  const slug = config.githubRepo ?? githubSlug(repo.url);
  if (!slug) return null;
  return githubForge({
    slug,
    token: repo.token,
    ...(config.githubApi ? { api: config.githubApi } : {}),
    ...(fetch ? { fetch } : {}),
  });
}
