export type LinkKind = "pull_request" | "commit" | "branch" | "url";

export interface ParsedLink {
  kind: LinkKind;
  /** The pull request number, the commit SHA, or the branch name. */
  ref: string | null;
}

/**
 * What a pasted URL points at. GitHub and GitLab name the same three things
 * differently, so the shapes are listed rather than guessed at, and anything
 * unrecognised is an ordinary `url` — a Link to a design or a document is as
 * valid as one to a pull request.
 */
export function parseLink(url: string): ParsedLink {
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
    if (match) return { kind, ref: decodeURIComponent(match[1]!) };
  }
  return { kind: "url", ref: null };
}
